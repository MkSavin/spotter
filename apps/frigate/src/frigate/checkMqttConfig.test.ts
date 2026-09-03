import { afterEach, describe, expect, test } from 'bun:test'
import type { CoreConfig } from '../config'
import { readMqttConfig } from './checkMqttConfig'

const config = {
  frigate: { remoteUrl: 'http://nvr.local/', authUser: '', authSecret: '' },
} as unknown as CoreConfig

const savedFetch = globalThis.fetch

const respond = (body: unknown, status = 200) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = savedFetch
})

describe('readMqttConfig', () => {
  test('включённый MQTT — сообщает хост', async () => {
    respond({ mqtt: { enabled: true, host: 'mosquitto' } })

    expect(await readMqttConfig(config)).toEqual({
      state: 'enabled',
      host: 'mosquitto',
    })
  })

  test('mqtt.enabled: false — источник никогда не пришлёт событий', async () => {
    // Frigate's own minimal config ships with this, and the NVR still looks
    // healthy in every other way.
    respond({ mqtt: { enabled: false } })

    expect(await readMqttConfig(config)).toEqual({ state: 'disabled' })
  })

  test('секции mqtt нет вовсе', async () => {
    respond({ cameras: { front: {} } })

    expect(await readMqttConfig(config)).toEqual({ state: 'absent' })
  })

  test('включён без явного host — не выдумываем адрес', async () => {
    respond({ mqtt: { enabled: true } })

    expect(await readMqttConfig(config)).toEqual({
      state: 'enabled',
      host: 'unset',
    })
  })

  test('enabled по умолчанию считается включённым', async () => {
    // Frigate serves the resolved config, so a present section without an
    // explicit false is on.
    respond({ mqtt: { host: 'broker' } })

    expect(await readMqttConfig(config)).toEqual({
      state: 'enabled',
      host: 'broker',
    })
  })

  test('нерабочий API — unknown, а не ложный вывод', async () => {
    respond({}, 502)

    const result = await readMqttConfig(config)
    expect(result.state).toBe('unknown')
  })

  test('сетевой сбой не роняет адаптер', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as unknown as typeof fetch

    const result = await readMqttConfig(config)
    expect(result.state).toBe('unknown')
  })
})
