import { describe, expect, test } from 'bun:test'
import type { ServiceStatus } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { BotContext } from '../../context'
import { userSignCommand } from './userSignCommand'

defaultLogger.disable()

const CODE = 'xK3p-Rd9Qm2A'

const pwaBeat = (over: Partial<ServiceStatus> = {}): ServiceStatus =>
  ({
    service: 'pwa',
    version: '1.0.0',
    node: 'cloud',
    uptime: 100,
    at: Date.now(),
    online: true,
    details: { url: 'http://pwa.spotter.host' },
    ...over,
  }) as ServiceStatus

/** Runs the command and returns the caption it would send. */
const caption = async (
  args: Record<string, string> = {},
  services: ServiceStatus[] = [],
): Promise<string> => {
  let sent = ''
  const context = {
    logger: defaultLogger.sub('test'),
    from: { id: 1, username: 'admin' },
    me: { username: 'spotter_bot' },
    session: { user: { recipientUuid: 'uuid' } },
    heartbeats: { all: () => services },
    commandBus: {
      send: async () => ({ ok: true, data: { code: CODE, role: 'USER' } }),
    },
    replyWithPhoto: async (_photo: unknown, options: { caption: string }) => {
      sent = options.caption
    },
  } as unknown as BotContext

  await userSignCommand.handle(context, args)
  return sent
}

describe('/user_sign', () => {
  test('код стоит отдельной строкой, без команды рядом', async () => {
    const text = await caption()

    // Нажатие копирует ровно то, что ждёт поле в веб-приложении. С `/login`
    // внутри тега команда уезжала вместе с кодом, и её стирали руками.
    expect(text).toContain(`<code>${CODE}</code>`)
    expect(text).not.toContain(`<code>/login`)
  })

  test('ссылка на веб-приложение появляется, когда PWA поднят', async () => {
    const text = await caption({}, [pwaBeat()])

    expect(text).toContain(`http://pwa.spotter.host/authorize?code=${CODE}`)
  })

  test('без PWA ссылки нет — вести некуда', async () => {
    expect(await caption()).not.toContain('/authorize')
  })

  test('молчащий PWA ссылки не даёт', async () => {
    expect(await caption({}, [pwaBeat({ online: false })])).not.toContain(
      '/authorize',
    )
  })

  test('код с привязкой к @username не зовёт в веб-приложение', async () => {
    // Такой код там всё равно отвергнут: на устройстве нет @username, с
    // которым его можно сверить.
    const text = await caption({ username: '@someone' }, [pwaBeat()])

    expect(text).not.toContain('/authorize')
    expect(text).toContain('@someone')
  })

  test('глубокая ссылка в Telegram остаётся на месте', async () => {
    expect(await caption()).toContain('spotter_bot')
  })
})
