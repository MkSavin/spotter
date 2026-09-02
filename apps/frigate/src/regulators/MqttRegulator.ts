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

  /** Reports a topic the broker refused, so a degraded start is visible. */
  onSubscribeError?: (topic: string, error: unknown) => void

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

    // One topic at a time, not one batch: a broker that refuses a single
    // subscription (an ACL, a topic its version does not know) fails the whole
    // batch, and an optional topic would then take the essential ones down with
    // it. Each failure is logged and skipped instead.
    const failed: string[] = []
    for (const topic of this.topics) {
      try {
        await context.mqtt.subscribeAsync(topic)
      } catch (error) {
        failed.push(topic)
        this.onSubscribeError?.(topic, error)
      }
    }

    // Every topic refused means no ingestion at all — that is a broken node, not
    // a degraded one, and it must not look healthy.
    if (failed.length === this.topics.length) {
      throw new Error(
        `MQTT: could not subscribe to any topic (${failed.join(', ')})`,
      )
    }

    context.mqtt.on('message', async (topic, payload) =>
      this.consumeMessages({ topic, contents: payload }, context),
    )
  }
}
