import { describe, expect, mock, test } from 'bun:test'
import type { CommandBus } from './CommandBus'
import { trySendCommand } from './trySendCommand'

const busThat = (send: CommandBus['send']) =>
  ({ send }) as Pick<CommandBus, 'send'>

describe('trySendCommand', () => {
  test('a reply comes back marked reached', async () => {
    const reply = { requestId: 'r1', ok: true, data: { count: 2 } }
    const outcome = await trySendCommand(
      busThat(mock(async () => reply)),
      'event.clear',
    )

    expect(outcome).toEqual({ reached: true, reply })
  })

  // A refusal is an answer: the domain was reached and said no.
  test('a refusal is reached, not an error', async () => {
    const reply = { requestId: 'r1', ok: false, error: 'not-found' }
    const outcome = await trySendCommand(
      busThat(mock(async () => reply)),
      'user.setRole',
    )

    expect(outcome.reached).toBe(true)
  })

  test('a throw becomes a value instead of escaping', async () => {
    const error = new Error('timed out')
    const outcome = await trySendCommand(
      busThat(
        mock(async () => {
          throw error
        }),
      ),
      'user.sign',
    )

    expect(outcome).toEqual({ reached: false, error })
  })

  test('kind, args and principal reach the bus unchanged', async () => {
    const send = mock(async () => ({ requestId: 'r1', ok: true }))

    await trySendCommand(busThat(send), 'user.setRole', { ref: 'a' }, 'uuid-1')

    expect(send).toHaveBeenCalledWith('user.setRole', { ref: 'a' }, 'uuid-1')
  })
})
