import type { MessageContent, Params } from '@appercot/protocol'
import {
  formatMuteSpan,
  formatSpan,
  isRole,
  mediaStreams,
  notificationStreams,
  parseDateSpan,
  parseMuteMinutes,
  parseRole,
  probeStreams,
  ROLES,
  type Role,
  safeParseSpotterEvent,
  satisfies,
  timelapseStreams,
} from '@spotter/transport'
import type { Context } from './context'
import { chatsRepo, requestsRepo } from './db/repository'
import { renderEvent } from './events'
import { menuRoles, text } from './platform'
import { startRequest } from './requests'

type Access = 'all' | 'anonymous' | 'authorized' | Role
type CommandInput = {
  context: Context
  chatId: string
  userId: string
  username: string
  requestId: string
  principalUuid?: string
  role?: Role | null
  args: string
}
type Command = {
  description: string
  access: Access
  cooldown?: number
  handle: (
    input: CommandInput,
  ) => MessageContent | null | Promise<MessageContent | null>
}

const login = async ({
  context,
  userId,
  chatId,
  username,
  role,
  args,
}: CommandInput) => {
  if (role) return text(`Вы авторизованы. Роль — ${role}.`)
  if (!args)
    return text(
      'Отправьте /start <код доступа>, полученный у администратора Spotter.',
    )
  const result = await context.commandBus.send('appercot.redeem', {
    code: args,
    userId,
    username,
  })
  if (!result.ok)
    return text('Код недействителен, просрочен или выдан другому пользователю.')
  const data = result.data as
    | { recipientUuid?: string; role?: unknown }
    | undefined
  if (typeof data?.recipientUuid !== 'string' || !isRole(data.role))
    throw new Error('Invalid Appercot login reply')
  chatsRepo.bind(context.db, {
    id: chatId,
    userId,
    recipientUuid: data.recipientUuid,
    role: data.role,
    blocked: false,
    mutedUntil: null,
  })
  return text(`Доступ открыт. Роль — ${data.role}.`)
}

const domain = (
  { context, principalUuid }: CommandInput,
  kind: string,
  args?: Record<string, unknown>,
) => context.commandBus.send(kind, args, principalUuid)

const setRole = async (input: CommandInput, ref: string, role?: Role) => {
  if (!ref || !role)
    return text(
      'Используйте /user_promote <UUID> <VIEWER|USER|ADMIN> или /user_demote <UUID>.',
    )
  const reply = await domain(input, 'user.setRole', { ref, role })
  return text(
    reply.ok ? `Роль обновлена — ${role}.` : 'Не удалось изменить роль.',
  )
}

const knownCamera = (context: Context, camera: string) => {
  const cameras = context.catalog.cameras(context.config.source)
  return cameras.length === 0 || cameras.some((entry) => entry.code === camera)
}

export const commands: Record<string, Command> = {
  start: {
    description: 'Начать работу с ботом',
    access: 'all',
    cooldown: 3000,
    handle: login,
  },
  login: {
    description: 'Авторизоваться в боте',
    access: 'anonymous',
    cooldown: 3000,
    handle: login,
  },
  logout: {
    description: 'Выйти из Spotter',
    access: 'authorized',
    handle: ({ context, chatId }) => {
      chatsRepo.update(context.db, chatId, { role: null, recipientUuid: null })
      return text('Вы вышли из Spotter.')
    },
  },
  me: {
    description: 'Информация об авторизации',
    access: 'authorized',
    handle: ({ principalUuid, role }) =>
      text(`Роль — ${role}\nUUID — ${principalUuid}`),
  },
  mute: {
    description: 'Приглушить уведомления на время',
    access: 'authorized',
    handle: ({ context, chatId, args }) => {
      const minutes = parseMuteMinutes(args)
      if (!minutes)
        return text('Используйте /mute 30 или /mute 2ч. Максимум — неделя.')
      chatsRepo.update(context.db, chatId, {
        mutedUntil: Date.now() + minutes * 60_000,
      })
      return text(
        `🔕 Уведомления приглушены на ${formatMuteSpan(minutes)}. Вернуть — /unmute.`,
      )
    },
  },
  unmute: {
    description: 'Вернуть уведомления',
    access: 'authorized',
    handle: ({ context, chatId }) => {
      chatsRepo.update(context.db, chatId, { mutedUntil: null })
      return text('🔔 Уведомления включены.')
    },
  },
  camera_list: {
    description: 'Получить список камер',
    access: 'USER',
    handle: ({ context }) =>
      text(
        context.catalog
          .cameras(context.config.source)
          .map(({ code, label }) => `${code} — ${label}`)
          .join('\n') || 'Каталог камер пока недоступен.',
      ),
  },
  camera_snapshot: {
    description: 'Получить последний кадр с камеры',
    access: 'USER',
    cooldown: 3000,
    async handle({ context, chatId, principalUuid, requestId, args: camera }) {
      if (!camera || !principalUuid)
        return text(
          'Используйте /camera_snapshot <камера>. Список камер — /camera_list.',
        )
      if (!knownCamera(context, camera)) return text('Камера не найдена.')
      const source = context.config.source
      await startRequest(
        context,
        {
          id: requestId,
          chatId,
          recipientUuid: principalUuid,
          kind: 'frame',
          title: `Кадр с камеры ${context.catalog.cameraLabel(source, camera)}`,
        },
        mediaStreams.cameraRequest(source),
        { source, camera },
      )
      return null
    },
  },
  timelapse: {
    description: 'Собрать таймлапс за период',
    access: 'USER',
    cooldown: 60_000,
    async handle({ context, chatId, principalUuid, requestId, args }) {
      const [, camera, period] = /^(\S+)\s+(.+)$/.exec(args) ?? []
      if (!camera || !principalUuid)
        return text(
          'Используйте /timelapse <камера> [realtime|timelapse] <период>. Например, /timelapse driveway сегодня.',
        )
      const [, speed = 'timelapse', spanText = period] =
        /^(realtime|timelapse)\s+(.+)$/.exec(period) ?? []
      const span = parseDateSpan(spanText, context.config.timezone)
      if (!span || span.start <= 0)
        return text(
          'Укажите период, например «сегодня» или «15.08 09:00-18:00».',
        )
      if (!knownCamera(context, camera)) return text('Камера не найдена.')
      const source = context.config.source
      const title = `Таймлапс ${context.catalog.cameraLabel(source, camera)} · ${formatSpan(span, context.config.timezone)}`
      await startRequest(
        context,
        {
          id: requestId,
          chatId,
          recipientUuid: principalUuid,
          kind: 'timelapse',
          title,
        },
        timelapseStreams.request(source),
        { source, camera, speed, ...span },
      )
      return null
    },
  },
  timelapse_status: {
    description: 'Показать таймлапсы в работе',
    access: 'USER',
    handle: ({ context, chatId, principalUuid }) =>
      text(
        requestsRepo
          .runningTimelapses(context.db, chatId, principalUuid ?? '')
          .map((request) => request.title)
          .join('\n') || 'Нет запущенных таймлапсов.',
      ),
  },
  nvr_suspend: {
    description: 'Приглушить уведомления NVR для всех',
    access: 'ADMIN',
    cooldown: 3000,
    async handle({ context, args }) {
      const [, camera, duration] = /^(\S+)\s+(.+)$/.exec(args) ?? []
      const minutes = duration === '0' ? 0 : parseMuteMinutes(duration ?? '')
      if (!camera || minutes === undefined)
        return text(
          'Используйте /nvr_suspend <камера|all> <срок>. Например, /nvr_suspend all 30. Снять — срок 0.',
        )
      if (camera !== 'all' && !knownCamera(context, camera))
        return text('Камера не найдена.')
      const source = context.config.source
      await context.producer.publish(notificationStreams.suspend(source), {
        source,
        camera,
        minutes,
      })
      return text(
        minutes
          ? `NVR приглушён на ${formatMuteSpan(minutes)} для всех каналов.`
          : 'Приглушение NVR снято.',
      )
    },
  },
  test: {
    description: 'Попросить NVR породить тестовое событие',
    access: 'ADMIN',
    cooldown: 3000,
    async handle({ context, chatId, principalUuid, requestId, args }) {
      const source = context.config.source
      const [
        camera = context.catalog.cameras(source)[0]?.code,
        label = 'person',
      ] = args.split(/\s+/).filter(Boolean)
      if (!camera || !principalUuid || !knownCamera(context, camera))
        return text('Камера не найдена. Используйте /test <камера> [объект].')
      await startRequest(
        context,
        {
          id: requestId,
          chatId,
          recipientUuid: principalUuid,
          kind: 'probe',
          title: `Тест NVR · ${camera} · ${label}`,
        },
        probeStreams.request(source),
        { source, camera, label, frames: 30, score: 0.9 },
      )
      return null
    },
  },
  user_list: {
    description: 'Показать пользователей и их UUID',
    access: 'ADMIN',
    cooldown: 3000,
    async handle(input) {
      const reply = await domain(input, 'user.list')
      if (!reply.ok) return text('Не удалось получить список пользователей.')
      const { users } = reply.data as {
        users: {
          uuid: string
          username?: string
          role: Role
          appercotUserId?: string
          tgUserId?: string
        }[]
      }
      return text(
        users
          .map(
            (user) =>
              `${user.username ? `@${user.username} · ` : ''}${user.appercotUserId ? 'Appercot · ' : user.tgUserId ? 'Telegram · ' : 'PWA · '}${user.role} · ${user.uuid}`,
          )
          .join('\n') || 'Нет пользователей.',
      )
    },
  },
  user_sign: {
    description: 'Создать код доступа',
    access: 'ADMIN',
    cooldown: 3000,
    async handle(input) {
      const [first, second, ...extra] = input.args.split(/\s+/).filter(Boolean)
      const username = first?.startsWith('@') ? first : undefined
      const rawRole = username ? second : first
      const role = rawRole ? parseRole(rawRole) : 'VIEWER'
      if (!role || extra.length || (!username && second))
        return text('Используйте /user_sign [@username] [VIEWER|USER|ADMIN].')
      const reply = await domain(input, 'user.sign', {
        username,
        role,
        platform: 'appercot',
      })
      if (!reply.ok) return text('Не удалось создать код доступа.')
      const { code } = reply.data as { code: string }
      return {
        text: `Роль — ${role}\n\nОткройте чат Spotter в Appercot и отправьте:\n\n\`/start ${code}\``,
      }
    },
  },
  user_promote: {
    description: 'Изменить роль пользователя',
    access: 'ADMIN',
    cooldown: 3000,
    handle: (input) => {
      const [ref = '', role = ''] = input.args.split(/\s+/, 2)
      return setRole(input, ref, parseRole(role))
    },
  },
  user_demote: {
    description: 'Сбросить роль до наблюдателя',
    access: 'ADMIN',
    cooldown: 3000,
    handle: (input) => setRole(input, input.args, 'VIEWER'),
  },
  user_revoke: {
    description: 'Отозвать доступ пользователя',
    access: 'ADMIN',
    cooldown: 3000,
    async handle(input) {
      if (!input.args) return text('Используйте /user_revoke <UUID>.')
      const reply = await domain(input, 'user.revoke', { ref: input.args })
      return text(reply.ok ? 'Доступ отозван.' : 'Не удалось отозвать доступ.')
    },
  },
  event_info: {
    description: 'Информация о событии',
    access: 'ADMIN',
    cooldown: 3000,
    async handle(input) {
      if (!input.args) return text('Используйте /event_info <код события>.')
      const reply = await domain(input, 'event.info', { code: input.args })
      const stored = (
        reply.data as { event?: Record<string, unknown> } | undefined
      )?.event
      const event =
        stored &&
        safeParseSpotterEvent({ ...stored, source: stored.source ?? undefined })
      return reply.ok && event
        ? { text: renderEvent(event, input.context) }
        : text('Событие не найдено.')
    },
  },
  event_clear: {
    description: 'Очистить список событий',
    access: 'ADMIN',
    cooldown: 3000,
    async handle(input) {
      const reply = await domain(input, 'event.clear')
      return text(
        reply.ok
          ? `Удалено событий — ${(reply.data as { count: number }).count}.`
          : 'Не удалось очистить события.',
      )
    },
  },
  status: {
    description: 'Показать состояние и версии сервисов',
    access: 'ADMIN',
    handle: ({ context }) =>
      text(
        context.heartbeats
          .all()
          .map(
            (beat) =>
              `${beat.online ? '🟢' : '🔴'} ${beat.node}/${beat.service} · ${beat.version}${beat.queues?.length ? ` · очередь ${beat.queues.reduce((sum, queue) => sum + queue.lag + queue.pending, 0)}` : ''}`,
          )
          .join('\n') || 'Сервисы пока не передали состояние.',
      ),
  },
}

export const commandMenu: Params<'setRoles'> = {
  roles: ROLES.map((role) => ({ code: menuRoles[role], name: role })),
  defaultRoles: [],
  commands: Object.entries(commands).map(([name, { description, access }]) => ({
    name,
    description,
    roles:
      access === 'all' || access === 'anonymous'
        ? ['authenticated']
        : [
            'owner',
            ...ROLES.filter((role) => satisfies(access, role)).map(
              (role) => menuRoles[role],
            ),
          ],
  })),
}
