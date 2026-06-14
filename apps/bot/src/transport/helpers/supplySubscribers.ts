import type { CoreContext } from '../../context'
import { chatsRepo } from '../../db/repository'
import type { Chat, EventMessage } from '../../db/schema'

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
  subscribedChats: Pick<Chat, 'id'>[],
  suppliedMessages: EventMessage[],
  supplyContext: SupplyContext<Create, Update, Remove>,
): Promise<SuppliedMessage<Devoidify<Create | Update | Remove>>[]> => {
  const actual = subscribedChats.map((chat) => chat.id)
  const supplied = suppliedMessages.map((message) => message.chatId)

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
        .filter((message) => actual.includes(message.chatId))
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
        .filter((message) => !actual.includes(message.chatId))
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
  const { db } = context

  const subscribedChats = chatsRepo.listIds(db)

  return supplySubscribedChats<Create, Update, Remove>(
    subscribedChats,
    suppliedMessages,
    supplyContext,
  )
}
