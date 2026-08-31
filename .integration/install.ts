#!/usr/bin/env bun

// First-run wizard: seeds .env from a template, asks only what is required,
// brings the stack up and prints an admin code. Idempotent — an existing .env
// is kept unless the user opts to overwrite.
//
//   ./spotter install [single|cloud|ingest] [--no-tunnel]

import { existsSync } from 'node:fs'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { $ } from 'bun'
import { configure } from './tunnel'

type Mode = 'single' | 'cloud' | 'ingest'

const rl = createInterface({ input: process.stdin, output: process.stdout })

// A throw would leave stdin open and hang the wizard silently.
process.on('uncaughtException', (error) => {
  console.error(`\n✗ ${error.message}`)
  rl.close()
  process.exit(1)
})

// Probing with the depot image itself: it is needed anyway, so nothing extra
// is pulled, and it tests the very container that will run in production.
const DEPOT_IMAGE = 'ghcr.io/mksavin/spotter-depot:latest'

const say = (msg = '') => console.log(msg)
// Counted, not hardcoded: which steps run depends on the mode.
let stepNumber = 0
const step = (msg: string) => say(`\n[${++stepNumber}] ${msg}`)

const ask = async (question: string, fallback = ''): Promise<string> => {
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = (await rl.question(`  ${question}${suffix}: `)).trim()
  return answer || fallback
}

const askYesNo = async (question: string, def = false): Promise<boolean> => {
  const hint = def ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`  ${question} (${hint}): `))
    .trim()
    .toLowerCase()
  if (!answer) return def
  return answer === 'y' || answer === 'yes' || answer === 'д' || answer === 'да'
}

const toBase64Url = (bytes: ArrayBuffer): string =>
  Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

/** VAPID keypair in base64url. Not via the image: it ships no node_modules. */
const generateVapidKeys = async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  return {
    publicKey: toBase64Url(await crypto.subtle.exportKey('raw', publicKey)),
    privateKey: jwk.d ?? '',
  }
}

type GpuProbe = { usable: boolean; reason: string }

/**
 * Probes CUDA end to end: only a container that actually starts with a GPU
 * proves the driver, the toolkit and the kernel module all line up.
 */
const probeGpu = async (): Promise<GpuProbe> => {
  try {
    await $`nvidia-smi`.quiet()
  } catch {
    return { usable: false, reason: 'карта или драйвер NVIDIA не обнаружены' }
  }

  const runtimes = await $`docker info --format ${'{{json .Runtimes}}'}`
    .quiet()
    .text()
    .catch(() => '')
  if (!runtimes.includes('nvidia'))
    return { usable: false, reason: 'не установлен nvidia-container-toolkit' }

  try {
    await $`docker run --rm --gpus all ${DEPOT_IMAGE} true`.quiet()
    return { usable: true, reason: '' }
  } catch {
    // Typically a driver upgrade with the old module still loaded.
    return {
      usable: false,
      reason: 'контейнер с --gpus не стартует (нужна перезагрузка узла?)',
    }
  }
}

/** Replace `KEY=...` in place. */
const setEnv = (content: string, key: string, value: string): string => {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (!pattern.test(content)) return `${content}\n${key}=${value}\n`
  return content.replace(pattern, `${key}=${value}`)
}

/**
 * Drops the `# a | b | c` hints the examples carry on value lines. They are a
 * reading aid for the template, and a copy-paste hazard in a real `.env`.
 * Whole-line comments stay: they are the file's documentation.
 */
export const stripValueHints = (content: string): string =>
  // `[^\n#]` and `[ \t]` keep the match on one line: `\s` would swallow the
  // newline and eat everything up to the next comment.
  content.replaceAll(/^([A-Z_][A-Z0-9_]*=[^\n#]*?)[ \t]+#[^\n]*$/gm, '$1')

const fail = (msg: string): never => {
  say(`\n✗ ${msg}`)
  rl.close()
  process.exit(1)
}

// 1. Docker
step('Проверяю Docker…')
try {
  await $`docker --version`.quiet()
  await $`docker compose version`.quiet()
  say('  ✓ Docker и Docker Compose на месте')
} catch {
  fail(
    'Не найден Docker или Docker Compose. Установи Docker Desktop / docker + \n' +
      '    docker-compose-plugin и запусти заново.',
  )
}

// 2. Mode
const args = process.argv.slice(2)
const noTunnel = args.includes('--no-tunnel')
// Undefined = ask; set = the answer was given on the command line.
const externalMqtt = args.includes('--external-mqtt')
  ? true
  : args.includes('--own-mqtt')
    ? false
    : undefined
const [preselected] = args.filter((arg) => !arg.startsWith('--'))
const isMode = (value: string): value is Mode =>
  value === 'single' || value === 'cloud' || value === 'ingest'

step('Режим развёртывания')
let mode: Mode
if (preselected && isMode(preselected)) {
  mode = preselected
} else {
  say('  1) single — всё на одной машине (проще всего)')
  say(
    '  2) cloud  — облачный узел распределёнки (server + telegram + опц. pwa/email)',
  )
  say('  3) ingest — узел рядом с камерами (frigate + depot + forwarder)')
  const modeChoice = await ask('Выбор (1/2/3)', '1')
  mode =
    ({ '1': 'single', '2': 'cloud', '3': 'ingest' } as const)[modeChoice] ??
    'single'
}
const exampleByMode: Record<Mode, string> = {
  single: '.env.example',
  cloud: '.env.cloud.example',
  ingest: '.env.ingest.example',
}
const example = exampleByMode[mode]
say(`  → режим: ${mode} (шаблон ${example})`)

// 3. Seed .env (idempotent)
step('Готовлю .env')
if (existsSync('.env')) {
  const overwrite = await askYesNo(
    '.env уже существует. Перезаписать из шаблона? (n — оставить и выйти)',
    false,
  )
  if (!overwrite) {
    say('  ✓ Оставляю текущий .env без изменений.')
    say('\nЗапусти стек вручную:  ./spotter up')
    rl.close()
    process.exit(0)
  }
}
if (!existsSync(example))
  fail(`Не найден шаблон ${example} в корне репозитория.`)
let env = stripValueHints(await Bun.file(example).text())
say(`  ✓ Скопировал ${example} → .env (пока в памяти)`)

// The CLI reads this back instead of asking for a mode on every command.
env = setEnv(env, 'SPOTTER_MODE', mode)

// 4. Required values
step('Обязательные параметры')
say('  S3-хранилище (любой S3-совместимый бэкенд):')
env = setEnv(
  env,
  'S3_HOST',
  await ask(
    'S3_HOST',
    mode === 'single' ? 'http://localhost:9000' : 'https://s3.example.com',
  ),
)
env = setEnv(env, 'S3_ACCESS', await ask('S3_ACCESS'))
env = setEnv(env, 'S3_SECRET', await ask('S3_SECRET'))
env = setEnv(env, 'S3_BUCKET', await ask('S3_BUCKET', 'spotter'))

if (mode === 'single' || mode === 'cloud') {
  env = setEnv(
    env,
    'TELEGRAM_TOKEN',
    await ask('TELEGRAM_TOKEN (от @BotFather)'),
  )
}

if (mode === 'ingest') {
  say('  Доступ к Frigate/NVR (живёт только на этом узле):')
  env = setEnv(
    env,
    'FRIGATE_REMOTE_URL',
    await ask('FRIGATE_REMOTE_URL', 'https://frigate.example.local'),
  )
  env = setEnv(
    env,
    'FRIGATE_AUTH_USER',
    await ask('FRIGATE_AUTH_USER', 'admin'),
  )
  env = setEnv(env, 'FRIGATE_AUTH_SECRET', await ask('FRIGATE_AUTH_SECRET'))
}

// 4a. MQTT broker — where Frigate publishes its events.
if (mode === 'ingest' || mode === 'single') {
  step('Брокер событий (MQTT)')
  say('  Frigate шлёт события в MQTT-брокер, а Spotter их оттуда читает.')
  say('  Если у твоего Frigate уже есть брокер (часто идёт с Home Assistant) —')
  say('  укажи его. Если нет — поставим свой.')
  say('')

  const own =
    externalMqtt === undefined
      ? await askYesNo('Поставить свой брокер?', true)
      : !externalMqtt

  if (own) {
    say('')
    say('  Свой брокер. Frigate должен как-то до него достучаться:')
    say('   • Frigate в Docker — подключи его к сети `spotter-mqtt`,')
    say('     тогда адрес брокера для него `mosquitto:1883`, порт не нужен.')
    say('   • Frigate не в Docker — откроем порт на этой машине.')
    say('')

    const inDocker = await askYesNo('Frigate запущен в Docker?', true)
    if (inDocker) {
      // Loopback keeps the port closed; Frigate comes in via the shared network.
      env = setEnv(env, 'MQTT_BIND', '127.0.0.1')
      say('')
      say('  Добавь в compose своего Frigate:')
      say('    networks: [spotter-mqtt]')
      say('  и в самом низу файла:')
      say('    networks:')
      say('      spotter-mqtt:')
      say('        external: true')
      say('  В config.yml Frigate: mqtt.host = mosquitto, mqtt.port = 1883')
    } else {
      const bind = await ask(
        'На каком адресе слушать (0.0.0.0 — на всех)',
        '0.0.0.0',
      )
      const port = await ask('Порт', '1883')
      env = setEnv(env, 'MQTT_BIND', bind)
      env = setEnv(env, 'MQTT_PORT', port)
      say('')
      say(
        `  В config.yml Frigate: mqtt.host = <IP этой машины>, mqtt.port = ${port}`,
      )
    }
    // By container name — this also switches the `mqtt` profile on.
    env = setEnv(env, 'MQTT_BROKER', 'mqtt://mosquitto:1883')
  } else {
    say('')
    say('  Готовый брокер. Если он в Docker — укажи имя контейнера и его сеть,')
    say('  тогда обойдёмся без портов на хосте. Посмотреть сети можно так:')
    say('    docker network ls')
    say('')

    const inDocker = await askYesNo('Брокер запущен в Docker?', true)

    if (inDocker) {
      const service = await ask('Имя контейнера брокера', 'mosquitto')
      const port = await ask('Порт внутри сети', '1883')
      const network = await ask('Имя его docker-сети', 'mosquitto')
      env = setEnv(env, 'MQTT_BROKER', `mqtt://${service}:${port}`)
      // Without joining its network the name fails to resolve (ESERVFAIL).
      env = setEnv(env, 'MQTT_NETWORK', network)
      env = setEnv(env, 'MQTT_NETWORK_EXTERNAL', 'true')
      say('')
      say(`  Подключим spotter-frigate к сети «${network}».`)
      say(`  Если сеть называется иначе — поправь MQTT_NETWORK в .env.`)
    } else {
      const host = await ask('Адрес брокера (host:port)', '172.17.0.1:1883')
      const url = /^mqtts?:\/\//.test(host) ? host : `mqtt://${host}`
      env = setEnv(env, 'MQTT_BROKER', url)
      say('')
      say('  Учти: 127.0.0.1 внутри контейнера — это сам контейнер, а не')
      say('  машина. Для брокера на этом же хосте бери адрес docker0 (обычно')
      say('  172.17.0.1).')
    }

    say('')
    say(
      '  Свой брокер не поднимаем. Убедись, что Frigate публикует именно туда',
    )
    say('  (в его config.yml — секция mqtt, topic_prefix = frigate).')
  }
}

// 4b. SSH tunnel to the cloud Redis (ingest only)
if (mode === 'ingest' && !noTunnel) {
  step('Канал до облачного узла (SSH-туннель)')
  const url = await configure({ say, ask })
  if (url) env = setEnv(env, 'REDIS_REMOTE_URL', url)
  else say('    Настроишь позже: sudo ./spotter tunnel')
}

// 5. Transcoding acceleration (ingest runs the depot replicas)
let useGpu = false
if (mode === 'ingest') {
  step('Ускорение перекодирования')
  say('  Проверяю GPU (это занимает несколько секунд)…')
  const gpu = await probeGpu()
  if (gpu.usable) {
    useGpu = true
    env = setEnv(env, 'VIDEO_ACCELERATION', 'cuda')
    say('  ✓ NVIDIA работает — включаю cuda (в разы быстрее CPU)')
  } else {
    env = setEnv(env, 'VIDEO_ACCELERATION', 'cpu')
    say(`  → GPU недоступен: ${gpu.reason}`)
    say('    Ставлю cpu — медленнее, но работает везде.')
    say('    Починив GPU, поставь VIDEO_ACCELERATION=cuda и подними с GPU=1.')
  }
}

// 6. PWA / VAPID (opt-in)
let wantPwa = false
if (mode === 'single' || mode === 'cloud') {
  step('PWA-фронтенд (опционально)')
  wantPwa = await askYesNo(
    'Включить PWA (Web Push)? Сгенерирую VAPID-пару',
    false,
  )
  if (wantPwa) {
    env = setEnv(
      env,
      'PUBLIC_URL',
      await ask('PUBLIC_URL (за TLS-прокси)', 'https://spotter.example.com'),
    )
    say('  Генерирую VAPID-ключи…')
    try {
      const { publicKey, privateKey } = await generateVapidKeys()
      env = setEnv(env, 'VAPID_PUBLIC_KEY', publicKey)
      env = setEnv(env, 'VAPID_PRIVATE_KEY', privateKey)
      say('  ✓ VAPID-пара записана в .env')
    } catch {
      say('  ! Не удалось сгенерировать VAPID-пару.')
      say('    Заполни VAPID_* вручную позже — см. .env.')
    }
  }
}

// 7. Write .env
step('Записываю .env')
await Bun.write('.env', env)
say(
  '  ✓ .env готов. Проверь остальные значения при желании — там рабочие дефолты.',
)

// 8. Bring the stack up
step('Поднимаю стек')
// The GPU overlay is on unless opted out; PWA rides its compose profile.
const upArgs = [
  ...(mode === 'ingest' && !useGpu ? ['--no-gpu'] : []),
  ...(wantPwa ? ['--pwa'] : []),
]
const upCommand = ['./spotter up', ...upArgs].join(' ')
const bringUp = await askYesNo(`Запустить сейчас (${upCommand})?`, true)
if (!bringUp) {
  say(`\nГотово. Когда будешь готов:  ${upCommand}`)
  rl.close()
  process.exit(0)
}
try {
  await $`./spotter up ${upArgs}`
} catch {
  fail(`${upCommand} завершился с ошибкой — смотри вывод выше.`)
}

// 9. Access code (single/cloud only)
if (mode === 'single' || mode === 'cloud') {
  step('Код доступа администратора')
  say('  Жду, пока server применит миграции…')
  await Bun.sleep(4000)
  try {
    const token =
      await $`docker exec spotter-server bun spotter sign admin`.text()
    say('\n──────────────────────────────────────────────')
    say(token.trim())
    say('──────────────────────────────────────────────')
    say('  Отправь боту:  /login <код>')
  } catch {
    say('  ! Не удалось выпустить код автоматически. Позже:  make token')
  }
}

say('\n✓ Готово.')
rl.close()
process.exit(0)
