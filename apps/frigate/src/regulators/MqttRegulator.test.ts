import { describe, expect, test } from 'bun:test'
import type { MqttClient } from 'mqtt'
import { MqttRegulator } from './MqttRegulator'

/** A broker that refuses whichever topics it is told to. */
const makeMqtt = (refuse: string[] = []) => {
  const subscribed: string[] = []
  return {
    connected: true,
    handlers: {} as Record<string, (...args: unknown[]) => void>,
    subscribed,
    on(event: string, cb: (...args: unknown[]) => void) {
      this.handlers[event] = cb
      return this
    },
    async subscribeAsync(topic: string) {
      if (refuse.includes(topic)) {
        throw new Error(`Subscription negative acknowledgement for ${topic}`)
      }
      subscribed.push(topic)
      return [{ topic, qos: 0 }]
    },
  }
}

describe('MqttRegulator.run', () => {
  test('отказ по одному топику не уносит остальные', async () => {
    const mqtt = makeMqtt(['frigate/reviews'])
    const refused: string[] = []

    const regulator = new MqttRegulator<{ mqtt: MqttClient }>()
    regulator.onSubscribeError = (topic) => refused.push(topic)
    regulator.on('frigate/events', async () => {})
    regulator.on('frigate/reviews', async () => {})

    await regulator.run({ mqtt: mqtt as unknown as MqttClient })

    // The essential topic survives an optional one being refused — the whole
    // point: events must not die because reviews were rejected.
    expect(mqtt.subscribed).toEqual(['frigate/events'])
    expect(refused).toEqual(['frigate/reviews'])
  })

  test('события продолжают обрабатываться после отказа по reviews', async () => {
    const mqtt = makeMqtt(['frigate/reviews'])
    const seen: string[] = []

    const regulator = new MqttRegulator<{ mqtt: MqttClient }>()
    regulator.onSubscribeError = () => {}
    regulator.on('frigate/events', async ({ contents }) => {
      seen.push(contents.toString())
    })
    regulator.on('frigate/reviews', async () => {})

    await regulator.run({ mqtt: mqtt as unknown as MqttClient })
    await mqtt.handlers.message?.('frigate/events', Buffer.from('payload'))

    expect(seen).toEqual(['payload'])
  })

  test('отказ по всем топикам — это сломанный узел, а не деградация', async () => {
    const mqtt = makeMqtt(['frigate/events', 'frigate/reviews'])

    const regulator = new MqttRegulator<{ mqtt: MqttClient }>()
    regulator.onSubscribeError = () => {}
    regulator.on('frigate/events', async () => {})
    regulator.on('frigate/reviews', async () => {})

    // Silently "running" with no ingestion at all would look healthy while
    // delivering nothing, which is the failure mode being fixed here.
    await expect(
      regulator.run({ mqtt: mqtt as unknown as MqttClient }),
    ).rejects.toThrow(/could not subscribe/)
  })

  test('когда брокер согласен, подписаны все топики', async () => {
    const mqtt = makeMqtt()

    const regulator = new MqttRegulator<{ mqtt: MqttClient }>()
    regulator.on('frigate/events', async () => {})
    regulator.on('frigate/reviews', async () => {})

    await regulator.run({ mqtt: mqtt as unknown as MqttClient })

    expect(mqtt.subscribed.sort()).toEqual([
      'frigate/events',
      'frigate/reviews',
    ])
  })
})
