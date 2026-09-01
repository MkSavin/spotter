import type { CoreContext } from '../../context'
import { tgChatsRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'

type Devoidify<Data> = Data extends void ? undefined : Data

type SuppliedMessage<Data> = EventMessage & {
  data: Data | undefined
  action: 'create' | 'update' | 'remove'
}

type SupplyContext<Create = void, Update = void, Remove = void> = {
  create?: (chatId: string) => Promise<Create>
  update?: (message: EventMessage) => Promise<Update>
  remove?: (message: EventMessage) => Promise<Remove>
}

/**
 * Result of a fan-out: every chat that succeeded (so callers can persist them
 * even on partial failure) plus whether any chat failed (so callers can rethrow
 * and let the regulator retry — persisted successes make that retry idempotent).
 */
export type SupplyResult<Data> = {
  supplied: SuppliedMessage<Data>[]
  failed: boolean
}

export const supplySubscribedChats = async <
  Create = void,
  Update = void,
  Remove = void,
>(
  subscribedChatIds: string[],
  suppliedMessages: EventMessage[],
  supplyContext: SupplyContext<Create, Update, Remove>,
): Promise<SupplyResult<Devoidify<Create | Update | Remove>>> => {
  const actual = subscribedChatIds
  const supplied = suppliedMessages.map((m) => m.chatId)

  const promiseCollection: Promise<
    SuppliedMessage<Devoidify<Create | Update | Remove>>
  >[] = []

  if (supplyContext.create) {
    const create = supplyContext.create
    promiseCollection.push(
      ...actual
        .filter((id) => !supplied.includes(id))
        .map(
          async (chatId): Promise<SuppliedMessage<Devoidify<Create>>> => ({
            chatId,
            id: -1,
            data: ((await create(chatId)) ?? undefined) as Devoidify<Create>,
            action: 'create',
          }),
        ),
    )
  }

  if (supplyContext.update) {
    const update = supplyContext.update
    promiseCollection.push(
      ...suppliedMessages
        .filter((m) => actual.includes(m.chatId))
        .map(
          async (message): Promise<SuppliedMessage<Devoidify<Update>>> => ({
            ...message,
            data: ((await update(message)) ?? undefined) as Devoidify<Update>,
            action: 'update',
          }),
        ),
    )
  }

  if (supplyContext.remove) {
    const remove = supplyContext.remove
    promiseCollection.push(
      ...suppliedMessages
        .filter((m) => !actual.includes(m.chatId))
        .map(
          async (message): Promise<SuppliedMessage<Devoidify<Remove>>> => ({
            ...message,
            data: ((await remove(message)) ?? undefined) as Devoidify<Remove>,
            action: 'remove',
          }),
        ),
    )
  }

  const settled = await Promise.allSettled(promiseCollection)

  return {
    supplied: settled
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          SuppliedMessage<Devoidify<Create | Update | Remove>>
        > => r.status === 'fulfilled',
      )
      .map((r) => r.value),
    failed: settled.some((r) => r.status === 'rejected'),
  }
}

export const supplySubscribers = async <
  Create = void,
  Update = void,
  Remove = void,
>(
  suppliedMessages: EventMessage[],
  context: CoreContext,
  supplyContext: SupplyContext<Create, Update, Remove>,
): Promise<SupplyResult<Devoidify<Create | Update | Remove>>> => {
  // Muted chats are skipped here rather than at render time: nothing should be
  // sent, edited or tracked for a chat that asked for silence.
  const chatIds = tgChatsRepo.listDeliverableIds(context.db).map((c) => c.id)

  return supplySubscribedChats<Create, Update, Remove>(
    chatIds,
    suppliedMessages,
    supplyContext,
  )
}
