import { Command } from '@grammyjs/commands'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { commandScopes } from '../commandScopes'

export const startCommand = new Command<BotContext>(
  'start',
  'Начать работу с ботом',
).addToScope(commandScopes.private, [
  guard('anonymous'),
  async (context, next) => {
    await context.replyWithHTML(
      `📹 <b>Бот-помощник для работы с NVR</b>

\u{2709}\u{FE0F} Отправляет оповещения и медиа-данные произошедших событий
📊 Позволяет получать статистику и общую информацию об инстансе NVR
🖼 Позволяет быстро получить актуальный скриншот или таймлепс с камер
      
Для начала работы с ботом авторизуйтесь через команду /login [код доступа]`,
    )

    return next()
  },
])
