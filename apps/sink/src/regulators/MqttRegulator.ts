import type { MqttClient } from 'mqtt'

type MqttMessagePayload = {
  topic: string
  contents: Buffer
}

export type MqttMessageController<Context> = (
  payload: MqttMessagePayload,
  context: Context,
) => Promise<void>

export type BaseContext = {
  mqtt: MqttClient
}

export class MqttRegulator<Context extends BaseContext> {
  subscribed: Record<string, MqttMessageController<Context>> = {}

  on(topic: string, callback: MqttMessageController<Context>): this {
    this.subscribed[topic] = callback
    return this
  }

  get topics(): string[] {
    return Object.keys(this.subscribed)
  }

  async consumeMessages(
    payload: MqttMessagePayload,
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
      this.consumeMessages({ topic, contents: payload }, context),
    )
  }
}
