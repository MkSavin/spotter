import type { BotApi } from '../../context'
import { InnoxiousExecutor } from './InnoxiousExecutor'

export const attachInnoxious = (api: BotApi): void => {
  const innoxiousExecutor = new InnoxiousExecutor()

  api.innoxious = {
    sendMediaGroup: (chatId, media, other, signal) => {
      return innoxiousExecutor.execute(media, async (resolver) =>
        api.sendMediaGroup(chatId, await resolver(), other, signal),
      )
    },

    sendPhoto: (chatId, media, other, signal) => {
      return innoxiousExecutor.execute(media, async (resolver) =>
        api.sendPhoto(chatId, (await resolver()).media, other, signal),
      )
    },

    sendDocument: (chatId, media, other, signal) => {
      return innoxiousExecutor.execute(media, async (resolver) =>
        api.sendDocument(chatId, (await resolver()).media, other, signal),
      )
    },

    sendVideo: (chatId, media, other, signal) => {
      return innoxiousExecutor.execute(media, async (resolver) =>
        api.sendVideo(chatId, (await resolver()).media, other, signal),
      )
    },
  }
}

export default attachInnoxious
