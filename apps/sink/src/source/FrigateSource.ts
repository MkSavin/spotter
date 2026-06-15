import { bufferToJson } from '@spotter/transport'
import { connectAsync as mqttConnectAsync } from 'mqtt'
import { parseFrigateEvent } from '../parsing/parseFrigateEvent'
import { MqttRegulator } from '../regulators/MqttRegulator'
import { type EventSink, Source, type SourceHandle } from './Source'

/**
 * Ingests Frigate events over MQTT (`frigate/events`), normalizes them via
 * parseFrigateEvent (which validates against the SpotterEvent contract) and
 * emits. Owns its own MQTT connection so the rest of the sink stays
 * transport-agnostic.
 */
export class FrigateSource extends Source {
  get code(): string {
    return 'frigate'
  }

  async run(emit: EventSink): Promise<SourceHandle> {
    const logger = this.logger.sub('source', this.code)

    const mqtt = await mqttConnectAsync(this.config.source.frigate.broker, {
      connectTimeout: 15 * 1000,
    })

    await new MqttRegulator<{ mqtt: typeof mqtt }>()
      .on('frigate/events', async ({ topic, contents }) => {
        const value = bufferToJson(contents)

        if (!value) {
          return
        }

        try {
          const event = parseFrigateEvent(value)
          await emit(event)
          logger.sub(topic, event.id).debug('Event emitted')
        } catch (error) {
          // Frigate regularly sends incomplete/buggy events — skip, don't crash.
          logger.warn(error)
          logger.verbose('Event data:', value)
        }
      })
      .run({ mqtt })

    return {
      stop: async () => {
        await mqtt.endAsync()
      },
    }
  }
}
