import { describe, expect, test } from 'bun:test'
import type { ServiceStatus } from '@spotter/transport'
import type { BotContext } from '../../context'
import { statusCommand } from './statusCommand'

const HOUR = 3600_000

/** Captures what /status would send, for one adapter service. */
const render = async (source?: ServiceStatus['source']): Promise<string> => {
  let out = ''
  const context = {
    heartbeats: {
      all: (): ServiceStatus[] => [
        {
          service: 'frigate',
          version: '1.5.0',
          node: 'ingest',
          uptime: 90_000,
          at: Date.now(),
          online: true,
          source,
        },
      ],
    },
    replyWithHTML: async (text: string) => {
      out = text
    },
  } as unknown as BotContext

  await statusCommand.handle(context)
  return out
}

describe('/status: тишина источника', () => {
  test('живой источник — видно, когда было последнее событие', async () => {
    const text = await render({
      source: 'frigate',
      lastEventAt: Date.now() - 120_000,
      eventCount: 42,
      since: 90_000,
    })

    expect(text).toContain('последнее событие')
    expect(text).not.toContain('Нет событий от NVR')
  })

  test('сутки тишины поднимают тревогу в шапке', async () => {
    const text = await render({
      source: 'frigate',
      lastEventAt: Date.now() - 24 * HOUR,
      eventCount: 42,
      since: 90_000,
    })

    // The exact failure that went unnoticed for a day: the service is up and
    // green, and only the source line says anything is wrong.
    expect(text).toContain('Нет событий от NVR')
    expect(text).toContain('🔴')
  })

  test('сервис без источника не печатает лишней строки', async () => {
    const text = await render(undefined)

    expect(text).not.toContain('последнее событие')
    expect(text).not.toContain('Нет событий от NVR')
  })

  test('свежий процесс без событий не тревожит', async () => {
    const text = await render({
      source: 'frigate',
      eventCount: 0,
      since: 600,
    })

    expect(text).toContain('событий не было')
    expect(text).not.toContain('Нет событий от NVR')
  })
})
