import { type EventSink, Source, type SourceHandle } from '@spotter/sink'
import { bufferToJson } from '@spotter/transport'
import { connectAsync as mqttConnectAsync } from 'mqtt'
import type { CoreConfig } from '../config'
import { reportMqttConfig } from '../frigate/checkMqttConfig'
import { parseFrigateEvent } from '../parsing/parseFrigateEvent'
import { parseFrigateReview } from '../parsing/parseFrigateReview'
import { MqttRegulator } from '../regulators/MqttRegulator'
import { ReviewVerdicts } from './ReviewVerdicts'

/**
 * Ingests Frigate events over MQTT (`frigate/events`), normalizes them via
 * parseFrigateEvent (which validates against the SpotterEvent contract) and
 * emits. Owns its own MQTT connection so the rest of the sink stays
 * transport-agnostic.
 */
export class FrigateSource extends Source<CoreConfig> {
  get code(): string {
    return 'frigate'
  }

  async run(emit: EventSink): Promise<SourceHandle> {
    const logger = this.logger.sub('source', this.code)
    const verdicts = new ReviewVerdicts()

    // Connecting to the broker proves nothing about the NVR: with MQTT off in
    // its own config it publishes no events, and every other sign of health
    // stays green. Say so at startup rather than leaving a silent adapter.
    void reportMqttConfig(this.config, logger)

    const mqtt = await mqttConnectAsync(this.config.source.frigate.broker, {
      connectTimeout: 15 * 1000,
    })

    const regulator = new MqttRegulator<{ mqtt: typeof mqtt }>()
    regulator.onSubscribeError = (topic, error) => {
      // Degraded, not dead: reviews are optional, events are not. Say which.
      logger.warn(`MQTT: broker refused "${topic}"`, error)
    }

    await regulator
      .on('frigate/events', async ({ topic, contents }) => {
        const value = bufferToJson(contents)

        if (!value) {
          return
        }

        try {
          const event = parseFrigateEvent(value)
          // Frigate's own verdict when it has already reached us; consumers
          // decide what an `alert` is worth versus a `detection`.
          const severity = verdicts.severityOf(event.id)
          await emit(severity ? { ...event, severity } : event)
          logger.sub(topic, event.id).debug('Event emitted')
        } catch (error) {
          // Frigate regularly sends incomplete/buggy events — skip, don't crash.
          logger.warn(error)
          logger.verbose('Event data:', value)
        }
      })
      .on('frigate/reviews', async ({ contents }) => {
        const value = bufferToJson(contents)
        if (!value) return

        const review = parseFrigateReview(value)
        if (!review) return

        verdicts.record(review.eventIds, review.severity)
      })
      .run({ mqtt })

    return {
      stop: async () => {
        await mqtt.endAsync()
      },
    }
  }
}
