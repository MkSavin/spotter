import type {
  Consumer,
  EachBatchPayload,
  EachMessagePayload,
  Producer,
} from 'kafkajs'

export type KafkaMessageController<Context> = (
  payload: EachMessagePayload,
  context: Context,
) => Promise<void>

export type KafkaBatchController<Context> = (
  payload: EachBatchPayload,
  context: Context,
) => Promise<void>

type BaseContext = {
  consumer: Consumer
  producer: Producer
}

export class KafkaRegulator<Context extends BaseContext> {
  messageSubscribers: Record<string, KafkaMessageController<Context>> = {}
  batchSubscribers: Record<string, KafkaBatchController<Context>> = {}

  message(topic: string, callback: KafkaMessageController<Context>): this {
    this.messageSubscribers[topic] = callback
    return this
  }
  batch(topic: string, callback: KafkaBatchController<Context>): this {
    this.batchSubscribers[topic] = callback
    return this
  }

  get topics(): string[] {
    return Object.keys(this.messageSubscribers)
  }

  async consumeMessages(
    payload: EachMessagePayload,
    context: Context,
  ): Promise<void> {
    await Promise.all(
      Object.entries(this.messageSubscribers)
        .filter(([topic]) => topic === payload.topic)
        .map(([_, handler]) => handler(payload, context)),
    )
  }

  async consumeBatches(
    payload: EachBatchPayload,
    context: Context,
  ): Promise<void> {
    await Promise.all(
      Object.entries(this.batchSubscribers)
        .filter(([topic]) => topic === payload.batch.topic)
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
      eachMessage: (payload) => this.consumeMessages(payload, context),
      eachBatch: (payload) => this.consumeBatches(payload, context),
    })
  }
}
