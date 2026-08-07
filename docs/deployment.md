# Развёртывание Spotter

**Скачал → заполнил один `.env` → одна команда.** По умолчанию поднимается
максимум сервисов; необязательное отключается флагом. Написано для тех, кто
впервые видит проект.

## Быстрый старт (3 шага)

### 1. Поставь Docker и скачай проект

Нужен только **Docker** (с Docker Compose — входит в Docker Desktop и в
`docker-compose-plugin`). Больше на хост ничего ставить не надо — ни bun, ни
node, ни unzip.

```bash
git clone https://github.com/mksavin/spotter.git spotter
cd spotter
```

### 2. Запусти мастер

Мастер спросит режим, попросит **только обязательное** (S3 и токен бота),
сгенерирует что нужно, поднимет стек и выдаст код доступа.

```bash
# если на хосте есть bun:
bun .integration/install.ts

# если bun нет — тот же мастер в контейнере:
docker run --rm -it -v "$PWD":/w -w /w oven/bun bun .integration/install.ts
```

Выбери режим **single** (всё на одной машине) — самый простой. Впиши S3-креды и
`TELEGRAM_TOKEN` от [@BotFather](https://t.me/BotFather). Остальное — с рабочими
дефолтами.

### 3. Войди

Мастер напечатает одноразовый код доступа. Отправь боту:

```
/login <код>
```

Готово. Поднялись `redis`, `mosquitto`, `frigate`, `depot`, `server`,
`telegram` и `watchtower` (авто-обновление). Дальше всё живёт само.

> **Без мастера, вручную:** `cp .env.example .env`, впиши S3 + `TELEGRAM_TOKEN`,
> затем `make single`, затем `make token`.

---

## Команды на каждый день

Все команды — из корня репозитория (пути к `.docker/` относительные). Длинные
`docker compose …` спрятаны за `make`:

| Действие | Команда |
| --- | --- |
| Поднять единый узел | `make single` |
| Поднять cloud-узел | `make cloud` |
| Поднять ingest-узел | `make ingest` |
| Статус | `make ps` (для cloud/ingest: `make ps MODE=cloud`) |
| Логи одного сервиса | `make logs s=server` |
| Остановить | `make down` |
| Выпустить код доступа | `make token` |
| Обновить вручную | `make update MODE=single` |

`make single` не делает `pull` — `up -d` сам скачивает недостающие образы.
`MODE` по умолчанию `single`; для распределёнки указывай `MODE=cloud` /
`MODE=ingest` в `ps`/`logs`/`down`/`update`.

Образы публичные (`ghcr.io/mksavin/spotter-*`) — **никакого `docker login`**.

---

## Как отключить необязательное

### Авто-обновление (Watchtower)

По умолчанию на узле крутится `watchtower`: раз в сутки проверяет реестр и
пере-раскатывает обновлённые `spotter-*` (redis/mosquitto не трогает,
`--cleanup` подчищает старые слои). Смержил релиз → CI собрал → Watchtower
выкатил, руки не нужны.

Не хочешь авто-обновление — подними без него:

```bash
make single WATCHTOWER=0
```

Изменить интервал (в секундах) — переменной `WATCHTOWER_INTERVAL`, напр. раз в
час:

```bash
WATCHTOWER_INTERVAL=3600 make single
```

Тогда обновляй руками: `make update MODE=single` (pull → up → prune).

### PWA и Email — фронтенды по желанию

`telegram` поднимается всегда. **PWA** (устанавливаемое веб-приложение с
пушами) и **Email** (SMTP-уведомления) — опциональны.

- **single:** PWA/Email в стек не входят. Нужны — добавь их сервисы по образцу
  из `production.cloud.yml`.
- **cloud:** сервисы `spotter-pwa` и `spotter-email` в
  `.deployment/compose/production.cloud.yml` **закомментированы**. Чтобы
  включить — раскомментируй нужный блок и заполни его секцию в `.env`
  (мастер умеет сгенерировать VAPID для PWA; вручную — см. ниже).

PWA ставь **за TLS-прокси** (Caddy/nginx): service worker и Web Push работают
только по HTTPS.

---

## Режим 2. Единый узел (`single`) — подробно

Одна машина и ингестит с NVR, и ходит в Telegram. Единый Redis, `forwarder` не
нужен.

```bash
cp .env.example .env       # впиши S3_* и TELEGRAM_TOKEN, остальное — дефолты
make single                # up -d (без pull), поднимет весь стек
make ps                    # проверить
make logs s=server         # смотреть логи домена
make token                 # выпустить код доступа admin
```

Заполнять в `.env` обязательно только `S3_*` и `TELEGRAM_TOKEN`. NVR-креды
(`FRIGATE_*`) — там же (единый узел, утекать некуда). Секции `pwa`/`email` можно
не трогать.

---

## Режим 3. Распределённо (`ingest` + `cloud`) — подробно

**Две машины**, между ними — VPN-туннель (см. раздел ниже). Пример адресов
внутри туннеля: cloud = `10.0.0.1`, ingest = `10.0.0.2`.

- **ingest-узел** (рядом с камерами): буферизует и транскодит. `forwarder`
  зеркалит стримы в облако и обратно, при обрыве канала копит всё в
  `local-redis` (appendonly) — ничего не теряется.
- **cloud-узел** (VPS): главный Redis, домен `server` и фронтенды.

### 3.1. Cloud-узел

```bash
cp .env.cloud.example .env    # S3_* + TELEGRAM_TOKEN; NVR-кредов тут НЕТ
make cloud                    # redis + server + telegram (+ watchtower)
make token                    # код доступа admin
```

> **Redis наружу не публикуй.** В `production.cloud.yml` порт `6379` открыт для
> примера — в бою привяжи его к интерфейсу туннеля (`10.0.0.1:6379:6379`), а не
> к `0.0.0.0`.

### 3.2. Ingest-узел

```bash
cp .env.ingest.example .env   # S3_* + FRIGATE_* (креды NVR живут ТОЛЬКО тут)
# впиши REDIS_REMOTE_URL — адрес облачного Redis внутри туннеля:
#   REDIS_REMOTE_URL=redis://10.0.0.1:6379
make ingest                   # local-redis, mosquitto, frigate, depot×2, forwarder
```

GPU-транскод: в `production.ingest.yml` у `depot` уже прописаны блоки
`deploy.resources`/`devices` под NVIDIA; выстави `VIDEO_ACCELERATION=cuda` в
`.env`.

---

## Автодеплой: где заканчивается CI

**CI собирает образы, но НЕ раскатывает их на узлы.**

```
push в master → release.yml → версии (changesets) → git-теги/Releases
                            → джоба на КАЖДОЕ приложение: сборка и пуш
                              в ghcr.io/mksavin/spotter-*:latest
                            └── на этом CI заканчивается ─┐
                                                          ▼
              дальше их подхватывает Watchtower на каждом узле (см. выше)
```

Хочешь контролировать «когда именно» — отключи Watchtower (`WATCHTOWER=0`) и
обновляй руками `make update MODE=…`, либо пинь конкретную версию образа
(`:1.4.0-alpine` вместо `:latest`) и меняй её осознанно.

Детали релиз-процесса (changesets, теги) — в [README](../README.md#cicd-и-релизы).

### Если какой-то образ не собрался

Каждое приложение собирается **отдельной джобой** (`Image (spotter-…)`), и они не
зависят друг от друга: упавший образ не отменяет остальные — доедет всё, кроме него.

1. В упавшем прогоне нажми **Re-run failed jobs** — пересоберутся только упавшие
   джобы, уже собранные образы трогать не нужно.
2. Если прогон старый или причина была в коде — собери недостающий образ руками
   (версию возьми из `package.json` приложения):
   ```bash
   echo $CR_PAT | docker login ghcr.io -u mksavin --password-stdin

   # Образы собираются под amd64 + arm64, а обычный драйвер так не умеет.
   docker buildx create --name spotter-multi --driver docker-container --use

   bun .integration/imperative.ts \
     --only='@spotter/email' \
     --versions='[{"name":"@spotter/email","version":"1.2.3"}]'
   ```

   > На Apple Silicon **не** собирай образы обычным `docker build` без
   > `--platform`: получится arm64-образ, и на amd64-сервере контейнер упадёт с
   > `exec format error`.
3. Проверить, доехал ли образ:
   ```bash
   docker manifest inspect ghcr.io/mksavin/spotter-email:1.2.3-alpine
   ```
   `manifest unknown` — образа в реестре нет.

> Повторный push в `master` образы **не** пересоберёт: pending-changeset'ов уже нет,
> `published` будет `false` и шаг сборки просто пропустится.

---

## Ручные операции

### Сгенерировать VAPID-пару для PWA вручную

Хостовый `web-push` не нужен — образ PWA его уже содержит:

```bash
docker run --rm ghcr.io/mksavin/spotter-pwa bunx web-push generate-vapid-keys
```

Впиши `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` в `.env`. Публичный ключ клиент
получает в рантайме через `GET /api/vapid` — пересобирать PWA не нужно.
Ротация приватного ключа инвалидирует все существующие подписки.

### Сделать образы публичными (шаг владельца репозитория)

Чтобы self-host обходился без `docker login`, образы должны быть публичными.
Один раз, в UI GitHub, для **каждого** из семи образов
(`spotter-depot`, `spotter-email`, `spotter-forwarder`, `spotter-frigate`,
`spotter-pwa`, `spotter-server`, `spotter-telegram`):

1. **GitHub → профиль/организация → Packages → выбрать `spotter-<имя>`.**
2. **Package settings → Danger Zone → Change visibility → Public.**
3. (Опц.) там же **Connect repository** → привязать к `mksavin/spotter`.

После этого `make single/cloud/ingest` на любой машине тянет образы анонимно.

### Выпустить код доступа вручную

```bash
make token                                 # = docker exec spotter-server bun spotter sign admin
# или напрямую, с опциями:
docker exec spotter-server bun spotter sign admin -b <bot_username>
```

---

## VPN-туннель между узлами (только для распределёнки)

ingest ↔ cloud общаются через приватный туннель: `forwarder` на ingest пишет в
`REDIS_REMOTE_URL` (Redis на cloud), а Redis на cloud слушает **только**
интерфейс туннеля. Ниже — свой WireGuard пошагово, затем — что делать, если
обычный WG режется.

Адреса в примере: **cloud = `10.0.0.1`**, **ingest = `10.0.0.2`**.

### Вариант A. Свой WireGuard (базовый)

На **обоих** узлах: `apt install wireguard` (или пакет дистрибутива).

**1. Ключи (на каждом узле):**

```bash
wg genkey | tee privatekey | wg pubkey > publickey
cat privatekey   # приватный — в свой конфиг
cat publickey    # публичный — отдать другой стороне
```

**2. Конфиг cloud-узла** — `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <приватный_ключ_CLOUD>

[Peer]
# ingest
PublicKey = <публичный_ключ_INGEST>
AllowedIPs = 10.0.0.2/32
```

**3. Конфиг ingest-узла** — `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.0.0.2/24
PrivateKey = <приватный_ключ_INGEST>

[Peer]
# cloud
PublicKey = <публичный_ключ_CLOUD>
Endpoint = <публичный_IP_CLOUD>:51820
AllowedIPs = 10.0.0.1/32
# держать туннель живым через NAT:
PersistentKeepalive = 25
```

**4. Поднять на обоих узлах и проверить:**

```bash
wg-quick up wg0
wg              # статус, рукопожатие
ping 10.0.0.1  # с ingest — должен идти пинг до cloud
```

Автозапуск: `systemctl enable wg-quick@wg0`.

**5. Привязать Redis к туннелю.** В `production.cloud.yml` замени публичный
проброс на адрес туннеля, чтобы Redis слушал только его:

```yaml
    ports:
      - '10.0.0.1:6379:6379'
```

На ingest в `.env`: `REDIS_REMOTE_URL=redis://10.0.0.1:6379`. `forwarder`
пойдёт в облако через туннель.

### Вариант B. AmneziaWG (когда обычный WG режется)

В некоторых сетях ТСПУ (DPI) распознаёт и режет обычный WireGuard —
рукопожатие не проходит или туннель рвётся. AmneziaWG — форк WireGuard с
обфускацией: тот же принцип и те же конфиги, но пакеты не опознаются как WG.

Ниже — подключение ingest к **уже поднятому** на cloud AmneziaVPN
(поставленному десктопным клиентом Amnezia — он разворачивает на сервере
docker-контейнер `amnezia-awg`).

**1. На cloud: выпустить конфиг для ingest.**

В десктопном клиенте Amnezia: соединение с сервером → **Пользователи** →
добавить нового (`ingest`) → выгрузить его конфиг (`.conf`). Это обычный
AmneziaWG-конфиг с секцией `[Interface]`, где кроме ключей есть параметры
обфускации `Jc/Jmin/Jmax/S1/S2/H1..H4` — **они должны совпадать с серверными**,
иначе рукопожатия не будет. Не собирай конфиг руками: выгружай из клиента.

**2. На ingest: поставить amneziawg.**

```bash
sudo apt install -y software-properties-common python3-launchpadlib gnupg2
sudo add-apt-repository -y ppa:amnezia/ppa
sudo apt update && sudo apt install -y amneziawg amneziawg-tools
```

**3. Положить конфиг.** `awg-quick` ищет его **только** в
`/etc/amnezia/amneziawg/`:

```bash
sudo mkdir -p /etc/amnezia/amneziawg
sudo cp ingest.conf /etc/amnezia/amneziawg/awg0.conf
sudo chmod 600 /etc/amnezia/amneziawg/awg0.conf
```

**4. Ограничить туннель одной подсетью.** Клиент Amnezia по умолчанию выдаёт
`AllowedIPs = 0.0.0.0/0` — это заворачивает в VPN *весь* трафик узла, включая
доступ к камерам в локальной сети и выгрузку в S3. Нам нужен только адрес
cloud-Redis, поэтому в `[Peer]` замени на подсеть туннеля:

```ini
AllowedIPs = 10.8.1.0/24
PersistentKeepalive = 25
```

`PersistentKeepalive` обязателен: ingest за NAT, без него cloud не сможет
достучаться после простоя. Точную подсеть и адрес сервера смотри в своём
конфиге (`Address` в `[Interface]`) — у Amnezia это обычно `10.8.1.0/24`.

**5. Поднять и проверить:**

```bash
sudo awg-quick up awg0
sudo awg                       # статус, latest handshake
ping -c3 10.8.1.1              # адрес cloud внутри туннеля
sudo systemctl enable awg-quick@awg0   # автозапуск
```

Если `latest handshake` пустой — не проходит обфускация: сверь `Jc/S1/H1…` с
серверными и проверь, что порт cloud доступен (`ListenPort` из конфига).

**6. Привязать к проекту.** На cloud Redis должен слушать **только** туннель.
В `production.cloud.yml`:

```yaml
    ports:
      - '10.8.1.1:6379:6379'
```

На ingest в `.env`:

```ini
REDIS_REMOTE_URL=redis://10.8.1.1:6379
```

Больше ничего менять не нужно: `spotter-forwarder` живёт в bridge-сети compose,
и трафик к `10.8.1.1` уходит через шлюз Docker на хост, а хост уже направляет
его в `awg0`. Пробрасывать туннель внутрь контейнера или переводить его в
`network_mode: host` не требуется.

**7. Проверить связность end-to-end** (с ingest):

```bash
docker compose -f .deployment/compose/production.ingest.yml \
  run --rm spotter-forwarder sh -c 'nc -zv 10.8.1.1 6379'
```

> **Про XRAY-VLESS.** Если режется и AmneziaWG — берут XRAY-VLESS (+Reality):
> это не VPN, а прокси-транспорт под видом обычного TLS. Redis заворачивается в
> VLESS-туннель, `REDIS_REMOTE_URL` смотрит на локальный конец прокси. Настройка
> зависит от домена-цели и здесь не расписана — см.
> [XTLS/Xray-core](https://xtls.github.io/).

---

Топологии и архитектура (со схемами) — в [README](../README.md#архитектура).
