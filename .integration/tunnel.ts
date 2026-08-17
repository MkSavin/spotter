// SSH tunnel to the cloud Redis, set up as a systemd service.
//
// The cloud Redis stays bound to loopback; the ingest forwarder reaches it
// through this tunnel. It listens on the docker0 address rather than
// 127.0.0.1 — inside the forwarder container loopback means the container.

import { existsSync } from 'node:fs'
import process from 'node:process'
import { $ } from 'bun'

const KEY = '/root/.ssh/spotter-tunnel'
const UNIT = '/etc/systemd/system/spotter-tunnel.service'

export type TunnelSetup = {
  host: string
  user: string
  port: number
  bridge: string
}

/** Host address on the docker bridge — where the tunnel must listen. */
export const bridgeAddress = async (): Promise<string | undefined> => {
  const output = await $`ip -4 -brief addr show docker0`
    .quiet()
    .text()
    .catch(() => '')
  return output.match(/(\d+\.\d+\.\d+\.\d+)\/\d+/)?.[1]
}

export const isRoot = (): boolean => process.getuid?.() === 0

/** Public key for the node, created on first run. */
export const ensureKey = async (): Promise<string> => {
  if (!existsSync(KEY)) {
    const result =
      await $`ssh-keygen -t ed25519 -N ${''} -f ${KEY} -C spotter-tunnel`
        .quiet()
        .nothrow()
    if (result.exitCode !== 0) {
      throw new Error(
        `ssh-keygen: ${result.stderr.toString().trim() || 'не удалось создать ключ'}`,
      )
    }
  }
  return (await $`cat ${KEY}.pub`.text()).trim()
}

/** Restricted authorized_keys line: this key may only forward Redis. */
export const authorizedLine = (publicKey: string): string =>
  'command="",no-agent-forwarding,no-X11-forwarding,no-pty,' +
  `permitopen="127.0.0.1:6379" ${publicKey}`

export const trustHost = async (setup: TunnelSetup): Promise<boolean> => {
  const { exitCode } =
    await $`ssh -i ${KEY} -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 -p ${setup.port} ${setup.user}@${setup.host} true`
      .quiet()
      .nothrow()
  return exitCode === 0
}

const unitFile = (setup: TunnelSetup): string => `[Unit]
Description=Spotter Redis tunnel to cloud
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ssh -NT -i ${KEY} \\
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \\
  -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \\
  -p ${setup.port} \\
  -L ${setup.bridge}:6379:127.0.0.1:6379 \\
  ${setup.user}@${setup.host}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`

export const installService = async (setup: TunnelSetup): Promise<void> => {
  await Bun.write(UNIT, unitFile(setup))

  const run = async (...args: string[]): Promise<void> => {
    const result = await $`systemctl ${args}`.quiet().nothrow()
    if (result.exitCode !== 0) {
      // Bare `.quiet()` would swallow this and the command would just stop.
      throw new Error(
        `systemctl ${args.join(' ')}: ${
          result.stderr.toString().trim() || `код ${result.exitCode}`
        }`,
      )
    }
  }

  await run('daemon-reload')
  await run('enable', 'spotter-tunnel')
  // `enable --now` leaves an already-running service on its old unit file;
  // restart is what actually picks up a changed host, port or key.
  await run('restart', 'spotter-tunnel')
}

/**
 * True once the cloud Redis answers through the tunnel. An open socket is not
 * enough: right after a restart the old ssh may still hold the port while
 * forwarding nowhere, so this waits for an actual PONG.
 */
export const verify = async (bridge: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const answered = await new Promise<boolean>((resolve) => {
      Bun.connect({
        hostname: bridge,
        port: 6379,
        socket: {
          open: (socket) => socket.write('PING\r\n'),
          data: (socket, data) => {
            socket.end()
            resolve(data.toString().includes('PONG'))
          },
          error: () => resolve(false),
          close: () => resolve(false),
        },
      }).catch(() => resolve(false))
      setTimeout(() => resolve(false), 3000)
    })
    if (answered) return true
    await Bun.sleep(1000)
  }
  return false
}

export type Prompt = {
  say: (msg?: string) => void
  ask: (question: string, fallback?: string) => Promise<string>
}

/**
 * Interactive setup shared by `spotter install ingest` and `spotter tunnel`.
 * Returns the Redis URL once the tunnel answers, undefined otherwise.
 */
export const configure = async ({
  say,
  ask,
}: Prompt): Promise<string | undefined> => {
  const bridge = await bridgeAddress()
  if (!bridge) {
    say('  ! Не нашёл интерфейс docker0 — Docker запущен?')
    return undefined
  }
  if (!isRoot()) {
    say('  ! Нужны права root, чтобы поставить службу — запусти через sudo.')
    return undefined
  }

  const host = await ask('Адрес облачного узла (IP или домен)')
  const user = await ask('SSH-пользователь на нём', 'root')
  const port = Number(await ask('SSH-порт', '22')) || 22
  const setup = { host, user, port, bridge }

  const publicKey = await ensureKey()
  say('\n  Добавь эту строку на облачном узле в ~/.ssh/authorized_keys:\n')
  say(`  ${authorizedLine(publicKey)}\n`)
  say('  Ключ ограничен: он может только пробросить Redis, зайти на сервер им')
  say('  нельзя. Скопируй строку целиком, вместе с началом до ssh-ed25519.\n')
  await ask('Готово? Нажми Enter', ' ')

  say('  Проверяю подключение…')
  if (!(await trustHost(setup))) {
    say('  ! Не удалось подключиться — проверь ключ, адрес и порт.')
    return undefined
  }

  say('  Поднимаю службу…')
  try {
    await installService(setup)
  } catch (error) {
    say(`  ! Не удалось поставить службу: ${(error as Error).message}`)
    return undefined
  }
  if (!(await verify(bridge))) {
    say('  ! Служба поставлена, но порт не отвечает.')
    say('    Смотри: systemctl status spotter-tunnel')
    return undefined
  }

  const url = `redis://${bridge}:6379`
  say(`  ✓ Туннель работает: ${url}`)
  return url
}
