import type { Consumer, EachMessagePayload, Producer } from 'kafkajs'

export type KafkaMessageController<Context> = (
  payload: EachMessagePayload,
  context: Context,
) => Promise<void>

type BaseContext = {
  consumer: Consumer
  producer: Producer
}

export class KafkaRegulator<Context extends BaseContext> {
  subscribed: Record<string, KafkaMessageController<Context>> = {}

  on(topic: string, callback: KafkaMessageController<Context>): this {
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
    await context.consumer.connect()
    await context.consumer.subscribe({
      topics: this.topics,
      fromBeginning: true,
    })

    await context.consumer.run({
      eachMessage: (message) => this.consumeMessages(message, context),
    })
  }
}
