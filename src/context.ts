import type { CommandsFlavor } from '@grammyjs/commands'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { RunnerHandle } from '@grammyjs/runner'
import type { Chat, PrismaClient, User } from '@prisma/client'
import type { SessionFlavor } from 'grammy'
import type { Context as BaseContext } from 'grammy/out/context'
import type mqtt from 'mqtt'
import type { Frigate } from './framework/api/Frigate'
import type { Stenograph } from './framework/stenograph/Stenograph'
import type { Session } from './session'

export type InitConfig = {
  token: string
  mqttUrl: string
  databaseUrl: string
  frigateRemoteUrl: string
}

export type ContentConfig = {
  objectLabels: Record<string, string>
  cameraLabels: Record<string, string>
}

export type Config = InitConfig & ContentConfig

export type InitContext = Config & {
  logger: Stenograph
  prisma: PrismaClient
  mqtt: mqtt.MqttClient
  frigate: Frigate

  runner: RunnerHandle | undefined
}

export type AuthorizationContext = {
  user: User | null
  chat: Chat | null
}

export type ShiftedContext = {
  logger: Stenograph
  prisma: PrismaClient
  mqtt: mqtt.MqttClient
  frigate: Frigate

  auth: AuthorizationContext | null
}

export type Context = ParseModeFlavor<
  HydrateFlavor<
    CommandsFlavor<BaseContext> & SessionFlavor<Session> & ShiftedContext
  >
>
