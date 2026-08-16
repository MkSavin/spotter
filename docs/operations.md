# Эксплуатация

Обновления, авто-деплой и ручные операции. Для первой установки это не нужно —
см. [deployment.md](deployment.md).

---

## Авто-обновление (Watchtower)

По умолчанию на узле крутится `watchtower`: раз в сутки проверяет реестр и
пере-раскатывает обновлённые `spotter-*` (`redis`/`mosquitto` не трогает,
`--cleanup` подчищает старые слои). Смержил релиз → CI собрал → Watchtower
выкатил.

Реже или чаще:

```bash
./spotter up --watchtower-interval=3600   # раз в час
```

Совсем без него:

```bash
./spotter up --no-watchtower
```

Тогда обновляй руками:

```bash
./spotter update   # pull → up → prune
```

---

## Где заканчивается CI

**CI собирает образы, но НЕ раскатывает их на узлы.**

```
merge version-PR → release.yml → джоба на КАЖДОЕ приложение: сборка и пуш
                                 в ghcr.io/mksavin/spotter-*:latest
                               → все успешны? → git-теги + GitHub Releases
                               └── на этом CI заканчивается ─┐
                                                             ▼
              дальше их подхватывает Watchtower на каждом узле
```

Теги ставятся **после** образов: если сборка упала, релиз не фиксируется, и
перезапуск упавшей джобы доводит его до конца.

Хочешь контролировать «когда именно» — отключи Watchtower и обновляй руками,
либо пинь конкретную версию образа (`:1.4.0-alpine` вместо `:latest`).

Детали релиз-процесса (changesets, теги) — в [README](../README.md#cicd-и-релизы).

### Если какой-то образ не собрался

Каждое приложение собирается **отдельной джобой** (`Image (spotter-…)`), и они не
зависят друг от друга: упавший образ не отменяет остальные — доедет всё, кроме
него.

1. В упавшем прогоне нажми **Re-run failed jobs** — пересоберутся только упавшие
   джобы. Когда все станут зелёными, автоматически отработает джоба `publish`:
   проставит теги и создаст Releases.
2. Если прогон старый или причина была в коде — собери образ руками (версию
   возьми из `package.json` приложения):

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

> Пока теги релиза не проставлены, `select-mode` продолжает возвращать `publish` —
> поэтому перезапуск прогона (или новый push в `master`) снова возьмётся за
> сборку. Как только теги появились, релиз считается состоявшимся.

---

## Ручные операции

### Выпустить код доступа

```bash
./spotter token
# или напрямую, с опциями:
docker exec spotter-server bun spotter sign admin -b <bot_username>
```

### Сгенерировать VAPID-пару для PWA

Мастер делает это сам при `--pwa`. Вручную:

```bash
docker run --rm ghcr.io/mksavin/spotter-pwa bunx web-push generate-vapid-keys
```

Впиши `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` в `.env`. Публичный ключ клиент
получает в рантайме через `GET /api/vapid` — пересобирать PWA не нужно.

### Сделать образы публичными (владельцу репозитория)

Чтобы self-host обходился без `docker login`, образы должны быть публичными.
Один раз, в UI GitHub, для **каждого** из семи образов (`spotter-depot`,
`spotter-email`, `spotter-forwarder`, `spotter-frigate`, `spotter-pwa`,
`spotter-server`, `spotter-telegram`):

1. **GitHub → профиль/организация → Packages → выбрать `spotter-<имя>`.**
2. **Package settings → Danger Zone → Change visibility → Public.**
3. Там же **Manage Actions access → Add repository** → привязать к
   `mksavin/spotter` с ролью **Write**, иначе CI не сможет пушить в этот пакет.

После этого `./spotter up` на любой машине тянет образы анонимно.

### Пересоздать контейнеры

Docker фиксирует проброс портов при создании контейнера, поэтому обычный `up`
не подхватывает правку портов или адресов в `.env`:

```bash
./spotter recreate
```
