import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { BotContext } from '../context'
import { createDatabase, type TelegramDatabase } from '../db/client'
import { dialogStatesRepo } from '../db/repository'
import { activeDialog, clearDialog, startDialog } from './Dialog'
import { textStep } from './steps/TextStep'
import { loadDialog } from './store'
import type { DialogComplete, DialogDefinition, DialogState } from './types'

let directory: string
let db: TelegramDatabase

beforeEach(() => {
  directory = path.join(tmpdir(), `spotter-dialog-${crypto.randomUUID()}`)
  db = createDatabase(path.join(directory, 'telegram.sqlite'))
})

afterEach(() => {
  db.$client.close()
  rmSync(directory, { recursive: true, force: true })
})

/** A context backed by real SQLite, with a fresh in-memory session each time. */
const makeContext = (session: { dialog?: DialogState } = {}) =>
  ({
    chatId: 10,
    from: { id: 20 },
    db,
    session: { user: session },
    logger: { debug: mock(() => undefined), warn: mock(() => undefined) },
    api: { editMessageText: mock(async () => undefined) },
    replyWithHTML: mock(async () => ({ message_id: 1 })),
  }) as unknown as BotContext

const definition = (
  complete: DialogComplete = async () => undefined,
): DialogDefinition => ({
  kind: 'test',
  steps: [
    textStep({ name: 'first', prompt: 'Первый?' }),
    textStep({ name: 'second', prompt: 'Второй?' }),
  ],
  complete,
})

describe('dialog persistence', () => {
  test('a started dialog is written to the database', async () => {
    await startDialog(makeContext(), definition())

    expect(dialogStatesRepo.find(db, '20', '10')).toBeDefined()
  })

  test('a fresh session recovers the dialog after a restart', async () => {
    const before = makeContext()
    await startDialog(before, definition(), { first: 'a' })
    const id = before.session.user.dialog?.id

    // A new context with an empty session is what a restarted bot sees.
    const after = makeContext()
    const recovered = loadDialog(after)

    expect(recovered?.id).toBe(id)
    expect(recovered?.values).toEqual({ first: 'a' })
    expect(recovered?.step).toBe(1)
  })

  test('completing a dialog removes the stored row', async () => {
    const complete = mock<DialogComplete>(async () => undefined)
    const context = makeContext()
    await startDialog(context, definition(complete), {
      first: 'a',
      second: 'b',
    })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(dialogStatesRepo.find(db, '20', '10')).toBeUndefined()
  })

  test('clearing a dialog removes the stored row', async () => {
    const context = makeContext()
    await startDialog(context, definition())
    clearDialog(context)

    expect(dialogStatesRepo.find(db, '20', '10')).toBeUndefined()
  })

  test('an expired stored dialog is dropped on load', async () => {
    const context = makeContext()
    await startDialog(context, definition())

    dialogStatesRepo.save(
      db,
      '20',
      '10',
      JSON.stringify({
        ...(context.session.user.dialog as DialogState),
        touchedAt: Date.now() - 600_000,
      }),
    )

    expect(activeDialog(makeContext())).toBeUndefined()
    expect(dialogStatesRepo.find(db, '20', '10')).toBeUndefined()
  })

  test('an unreadable row is discarded instead of wedging the user', () => {
    dialogStatesRepo.save(db, '20', '10', 'not json')

    expect(loadDialog(makeContext())).toBeUndefined()
    expect(dialogStatesRepo.find(db, '20', '10')).toBeUndefined()
  })

  test('dialogs are isolated per user', async () => {
    await startDialog(makeContext(), definition())

    const other = {
      chatId: 10,
      from: { id: 99 },
      db,
      session: { user: {} },
      logger: { debug: mock(() => undefined), warn: mock(() => undefined) },
    } as unknown as BotContext

    expect(loadDialog(other)).toBeUndefined()
  })

  test('prune drops only dialogs past the cutoff', async () => {
    await startDialog(makeContext(), definition())

    expect(dialogStatesRepo.prune(db, new Date(Date.now() - 600_000))).toBe(0)
    expect(dialogStatesRepo.prune(db, new Date(Date.now() + 1000))).toBe(1)
  })
})
