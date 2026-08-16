# Канал между машинами (SSH-туннель)

Нужен только для топологии из двух машин (`cloud` + `ingest`).

`forwarder` на ingest пишет в Redis на cloud. Открывать Redis в интернет нельзя —
его быстро найдут и взломают. Поэтому Redis слушает только сам себя, а ingest
приходит к нему через **SSH-туннель**. SSH уже есть на любом сервере.

**Мастер настраивает всё сам** при `sudo ./spotter install ingest`.

Если ставил с `--no-tunnel` или туннель нужно перенастроить — тот же диалог
отдельной командой:

```bash
sudo ./spotter tunnel
```

Она запишет `REDIS_REMOTE_URL` в существующий `.env`; после неё — `./spotter
recreate`.

Читай дальше, только если что-то не сработало или нужен свой вариант.

---

## Что делает мастер

1. Находит адрес машины в сети Docker (обычно `172.17.0.1`) — туннель должен
   слушать именно его. Для `forwarder` внутри контейнера `127.0.0.1` означает
   сам контейнер, а не машину, поэтому loopback не подходит.
2. Создаёт ключ `/root/.ssh/spotter-tunnel` и печатает строку для cloud-машины.
   **Тут останавливается и ждёт** — вставь строку и нажми Enter.
3. Проверяет подключение.
4. Ставит службу `spotter-tunnel` (автозапуск, перезапуск после обрыва).
5. Проверяет порт и записывает `REDIS_REMOTE_URL` в `.env`.

Строка, которую он печатает, идёт в `~/.ssh/authorized_keys` на **cloud**:

```
command="",no-agent-forwarding,no-X11-forwarding,no-pty,permitopen="127.0.0.1:6379" ssh-ed25519 AAAA... spotter-tunnel
```

Начало до `ssh-ed25519` — не украшение: оно запрещает этим ключом всё, кроме
проброса Redis. Даже украденный ключ не даст зайти на сервер. Копируй целиком.

---

## Проверка

На ingest:

```bash
systemctl status spotter-tunnel   # active (running)
./spotter logs forwarder          # без ошибок подключения
```

На cloud:

```bash
./spotter exec redis redis-cli CLIENT LIST | grep 127.0.0.1
```

Строка с `cmd=xreadgroup` или `cmd=xadd` — ingest дошёл.

---

## Если не работает

| Симптом | Что делать |
| --- | --- |
| `Permission denied` в статусе службы | строка не добавлена в `authorized_keys` на cloud |
| «нужны права root» | запусти мастер через `sudo` |
| «не нашёл docker0» | запусти Docker и повтори |
| Порт не отвечает | на cloud не поднят Redis: `./spotter ps` |
| Ошибки в логах `forwarder` | проверь `REDIS_REMOTE_URL` в `.env` |

Перезапуск:

```bash
sudo systemctl restart spotter-tunnel
```

---

## Настроить вручную

Нужен нестандартный порт, другой пользователь или свой ключ — пропусти
автоматику:

```bash
sudo ./spotter install ingest --no-tunnel
```

(Передумал — `sudo ./spotter tunnel` настроит стандартный вариант.)

Узнай адрес машины в сети Docker:

```bash
ip -brief addr show docker0
```

Создай `/etc/systemd/system/spotter-tunnel.service`:

```ini
[Unit]
Description=Spotter Redis tunnel to cloud
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ssh -NT -i /root/.ssh/spotter-tunnel \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \
  -p 22 \
  -L 172.17.0.1:6379:127.0.0.1:6379 \
  root@АДРЕС-CLOUD-МАШИНЫ
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Включи:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spotter-tunnel
```

И пропиши в `.env` на ingest:

```
REDIS_REMOTE_URL=redis://172.17.0.1:6379
```

---

## Про Redis на cloud

Ничего настраивать не надо: `REDIS_BIND=127.0.0.1` стоит по умолчанию и это
правильно. Проверить:

```bash
ss -tlnp | grep 6379
```

Должно быть `127.0.0.1:6379`. Если `0.0.0.0:6379` — Redis открыт в интернет,
проверь `REDIS_BIND` в `.env` и выполни `./spotter recreate`.
