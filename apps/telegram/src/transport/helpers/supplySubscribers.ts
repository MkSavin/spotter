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

export const supplySubscribedChats = async <
  Create = void,
  Update = void,
  Remove = void,
>(
  subscribedChatIds: string[],
  suppliedMessages: EventMessage[],
  supplyContext: SupplyContext<Create, Update, Remove>,
): Promise<SuppliedMessage<Devoidify<Create | Update | Remove>>[]> => {
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

  return Promise.all(promiseCollection)
}

export const supplySubscribers = async <
  Create = void,
  Update = void,
  Remove = void,
>(
  suppliedMessages: EventMessage[],
  context: CoreContext,
  supplyContext: SupplyContext<Create, Update, Remove>,
): Promise<SuppliedMessage<Devoidify<Create | Update | Remove>>[]> => {
  const chatIds = tgChatsRepo.listIds(context.db).map((c) => c.id)

  return supplySubscribedChats<Create, Update, Remove>(
    chatIds,
    suppliedMessages,
    supplyContext,
  )
}
