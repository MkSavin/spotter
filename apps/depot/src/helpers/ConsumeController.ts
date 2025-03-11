import type { ConsumerEachMessagePayload, EachMessageHandler } from 'kafkajs'

export class ConsumeController {
  subscribed: Record<string, EachMessageHandler> = {}

  on(topic: string, callback: EachMessageHandler): this {
    this.subscribed[topic] = callback
    return this
  }

  get topics(): string[] {
    return Object.keys(this.subscribed)
  }

  async consumeMessages(payload: ConsumerEachMessagePayload): Promise<void> {
    await Promise.all(
      Object.entries(this.subscribed)
        .filter(([topic]) => topic === payload.topic)
        .map(([_, handler]) => handler(payload)),
    )
  }
}
