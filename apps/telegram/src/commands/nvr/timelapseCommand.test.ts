import { describe, expect, mock, test } from 'bun:test'
import type { BotContext } from '../../context'
import { parseDateSpan } from '../../timelapse/dateSpan'
import { timelapseCommand } from './timelapseCommand'

const ZONE = 'Europe/Moscow'

const makeContext = (cameras: string[] = ['front']) => {
  const published: Array<{ stream: string; payload: any }> = []
  const replies: string[] = []

  const context = {
    chatId: 55,
    config: { source: 'frigate', timezone: ZONE },
    catalog: {
      cameras: () => cameras.map((code) => ({ code, label: `🎥 ${code}` })),
      cameraLabel: (_source: string, code: string) => `🎥 ${code}`,
    },
    logger: { error: mock(() => undefined) },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    },
    replyWithHTML: mock(async (text: string) => {
      replies.push(text)
      return { message_id: 9, editText: mock(async () => undefined) }
    }),
  } as unknown as BotContext

  return { context, published, replies }
}

describe('timelapse command', () => {
  test('publishes a request routed to the source adapter', async () => {
    const { context, published } = makeContext()

    await timelapseCommand.handle(context, {
      camera: 'front',
      span: '15.08.2026',
      speed: 'timelapse',
    })

    expect(published).toHaveLength(1)
    expect(published[0]?.stream).toBe('spotter.timelapse.request.frigate')

    const expected = parseDateSpan('15.08.2026', ZONE)
    expect(published[0]?.payload).toMatchObject({
      source: 'frigate',
      camera: 'front',
      speed: 'timelapse',
      start: expected?.start,
      end: expected?.end,
      chatId: 55,
      // Correlates the eventual video back to the placeholder message.
      messageId: 9,
    })
  })

  test('accepts the span the dialog already parsed', async () => {
    const { context, published } = makeContext()

    await timelapseCommand.handle(context, {
      camera: 'front',
      span: '1700000000-1700003600',
      speed: 'realtime',
    })

    expect(published[0]?.payload).toMatchObject({
      start: 1_700_000_000,
      end: 1_700_003_600,
      speed: 'realtime',
    })
  })

  test('rejects a camera the NVR does not have', async () => {
    const { context, published, replies } = makeContext(['front'])

    await timelapseCommand.handle(context, {
      camera: 'garden',
      span: 'сегодня',
      speed: 'timelapse',
    })

    expect(published).toHaveLength(0)
    expect(replies[0]).toContain('не найдена')
  })

  test('does not publish an unparseable period', async () => {
    const { context, published, replies } = makeContext()

    await timelapseCommand.handle(context, {
      camera: 'front',
      span: 'когда-нибудь',
      speed: 'timelapse',
    })

    expect(published).toHaveLength(0)
    expect(replies[0]).toContain('Не понял период')
  })

  test('falls back to the timelapse speed for an unknown value', async () => {
    const { context, published } = makeContext()

    await timelapseCommand.handle(context, {
      camera: 'front',
      span: 'сегодня',
      speed: 'ludicrous',
    })

    expect(published[0]?.payload.speed).toBe('timelapse')
  })

  test('offers exactly the two speeds the NVR API accepts', async () => {
    const speed = timelapseCommand.args.find((arg) => arg.name === 'speed')
    const choices = await speed?.choices?.({} as BotContext)

    expect(choices?.map((choice) => choice.code)).toEqual([
      'timelapse',
      'realtime',
    ])
  })

  test('the span step re-asks instead of failing on bad input', async () => {
    const span = timelapseCommand.args.find((arg) => arg.name === 'span')
    const context = makeContext().context

    expect(span?.parse?.('вчера', context)).toMatchObject({ status: 'done' })
    expect(span?.parse?.('никогда', context)).toMatchObject({
      status: 'retry',
    })
  })

  test('the signature renders without HTML-unsafe characters', () => {
    // Prompts are sent as HTML; a raw < or > would make Telegram reject them.
    expect(timelapseCommand.signature).not.toMatch(/[<>&]/)
  })
})
