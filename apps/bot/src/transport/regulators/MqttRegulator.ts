import type { MqttClient } from 'mqtt'

type EachMessagePayload = {
  topic: string
  payload: Buffer
}

export type MessageController<Context> = (
  payload: EachMessagePayload,
  context: Context,
) => Promise<void>

type BaseContext = {
  mqtt: MqttClient
}

export class MqttRegulator<Context extends BaseContext> {
  subscribed: Record<string, MessageController<Context>> = {}

  on(topic: string, callback: MessageController<Context>): this {
    this.subscribed[topic] = callback
    return this
  }

  get topics(): string[] {
    return Object.keys(this.subscribed)
  }

  async consumeMessages(
    payload: EachMessagePayload,
    context: Context,
  ): Promise<void> {
    await Promise.all(
      Object.entries(this.subscribed)
        .filter(([topic]) => topic === payload.topic)
        .map(([_, handler]) => handler(payload, context)),
    )
  }

  async run(context: Context): Promise<void> {
    await new Promise<void>((resolve) => {
      if (context.mqtt.connected) {
        resolve()
        return
      }

      context.mqtt.on('connect', () => resolve())
    })

    await context.mqtt.subscribeAsync(this.topics)

    context.mqtt.on('message', async (topic, payload) =>
      this.consumeMessages({ topic, payload }, context),
    )
  }
}
