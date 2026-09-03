import { describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { TransportContext } from '../../context'
import { probeResultController } from './probeResultController'

defaultLogger.disable()

type Sent = { chatId: number; text: string }

const deliver = async (result: Record<string, unknown>): Promise<Sent[]> => {
  const sent: Sent[] = []
  const context = {
    logger: defaultLogger.sub('test'),
    bot: {
      api: {
        sendMessage: async (chatId: number, text: string) => {
          sent.push({ chatId, text })
        },
      },
    },
  } as unknown as TransportContext

  await probeResultController(
    { message: { value: Buffer.from(JSON.stringify(result)) } } as never,
    context,
  )

  return sent
}

describe('probeResultController', () => {
  test('отказ приезжает в чат с причиной', async () => {
    // Главное свойство: молчащий `/test` неотличим от сбоя, который он ищет.
    const sent = await deliver({
      source: 'frigate',
      staged: false,
      reason: 'Фиктивный детектор не запущен.',
      chatId: 42,
    })

    expect(sent).toHaveLength(1)
    expect(sent[0].chatId).toBe(42)
    expect(sent[0].text).toContain('не запущен')
  })

  test('успех говорит, что дальше ждать событие', async () => {
    const sent = await deliver({
      source: 'frigate',
      staged: true,
      camera: 'front',
      frames: 30,
      chatId: 42,
    })

    expect(sent[0].text).toContain('front')
    expect(sent[0].text).toContain('30')
  })

  test('без чата ничего не шлём, но и не молчим в лог', async () => {
    expect(await deliver({ source: 'frigate', staged: true })).toEqual([])
  })

  test('мусор в стриме не роняет обработчик', async () => {
    expect(await deliver({ nonsense: true })).toEqual([])
  })
})
