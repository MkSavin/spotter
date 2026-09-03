import { describe, expect, test } from 'bun:test'
import type { Heartbeat } from '../schema/heartbeat'
import { startHeartbeat } from './publishHeartbeat'

const collector = () => {
  const beats: Heartbeat[] = []
  return {
    beats,
    publish: async (_stream: string, payload: unknown) => {
      beats.push(payload as Heartbeat)
      return '1-0'
    },
  }
}

describe('startHeartbeat: активность источника', () => {
  test('активность попадает в удар', async () => {
    const producer = collector()
    const stop = startHeartbeat(producer, {
      service: 'frigate',
      version: '1.0.0',
      source: () => ({
        source: 'frigate',
        lastEventAt: 1_700_000_000_000,
        eventCount: 42,
        since: 3600,
      }),
    })
    await Bun.sleep(10)
    stop()

    expect(producer.beats[0].source).toEqual({
      source: 'frigate',
      lastEventAt: 1_700_000_000_000,
      eventCount: 42,
      since: 3600,
    })
  })

  test('сервисы без источника не шлют поле', async () => {
    const producer = collector()
    const stop = startHeartbeat(producer, {
      service: 'server',
      version: '1.0.0',
    })
    await Bun.sleep(10)
    stop()

    expect(producer.beats[0].source).toBeUndefined()
  })

  test('падение пробы не срывает удар', async () => {
    const producer = collector()
    const stop = startHeartbeat(producer, {
      service: 'frigate',
      version: '1.0.0',
      source: () => {
        throw new Error('probe exploded')
      },
    })
    await Bun.sleep(10)
    stop()

    // Liveness matters more than the extra field: the beat must still land.
    expect(producer.beats).toHaveLength(1)
    expect(producer.beats[0].service).toBe('frigate')
    expect(producer.beats[0].source).toBeUndefined()
  })

  test('счётчик перечитывается каждый удар, а не фиксируется на старте', async () => {
    const producer = collector()
    let count = 0
    const stop = startHeartbeat(producer, {
      service: 'frigate',
      version: '1.0.0',
      source: () => ({ source: 'frigate', eventCount: ++count, since: 10 }),
    })
    await Bun.sleep(10)
    stop()

    expect(producer.beats[0].source?.eventCount).toBe(1)
  })
})

describe('startHeartbeat: подменённый детектор', () => {
  const beat = async (probeActive?: () => boolean) => {
    const producer = collector()
    const stop = startHeartbeat(producer, {
      service: 'frigate',
      version: '1.0.0',
      probeActive,
    })
    await Bun.sleep(10)
    stop()
    return producer.beats[0]
  }

  test('поле отсутствует, когда детектора-заглушки нет', async () => {
    // Сервисы без детектора вообще не должны слать это поле — иначе `false`
    // на каждом из них засорит и удар, и страницу статуса.
    expect((await beat()).probeActive).toBeUndefined()
    expect((await beat(() => false)).probeActive).toBeUndefined()
  })

  test('поле выставлено, пока probe настроен', async () => {
    expect((await beat(() => true)).probeActive).toBe(true)
  })

  test('падение проверки не срывает удар', async () => {
    // Тот же принцип, что и у source: молчащий сервис выглядит мёртвым, и это
    // худшая ложь, чем пропавшее предупреждение.
    const payload = await beat(() => {
      throw new Error('probe check exploded')
    })

    expect(payload.service).toBe('frigate')
    expect(payload.probeActive).toBeUndefined()
  })
})
