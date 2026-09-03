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

  test('мёртвая камера видна в шапке и у источника', async () => {
    const text = await render({
      source: 'frigate',
      lastEventAt: Date.now() - 60_000,
      eventCount: 5,
      since: 90_000,
      deadCameras: ['front'],
    })

    // The 1 September failure: the NVR knew within seconds, we did not.
    expect(text).toContain('NVR не получает видео')
    expect(text).toContain('нет видео: front')
  })

  test('камера с видео, но без детекции — отдельная беда', async () => {
    const text = await render({
      source: 'frigate',
      lastEventAt: Date.now() - 60_000,
      eventCount: 5,
      since: 90_000,
      stalledCameras: ['front'],
    })

    expect(text).toContain('нет детекции: front')
    // Not the same fault as a dead stream, so it must not claim one.
    expect(text).not.toContain('NVR не получает видео')
  })

  test('здоровые камеры не печатают лишнего', async () => {
    const text = await render({
      source: 'frigate',
      lastEventAt: Date.now() - 60_000,
      eventCount: 5,
      since: 90_000,
    })

    expect(text).not.toContain('нет видео')
    expect(text).not.toContain('нет детекции')
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
