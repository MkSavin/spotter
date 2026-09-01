import { NotificationSuspender } from '@spotter/sink'
import { type MqttClient, connectAsync as mqttConnectAsync } from 'mqtt'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'

/** `all` targets every camera at once, through Frigate's global topic. */
const ALL_CAMERAS = 'all'

/**
 * Suspends Frigate's own notifications over MQTT.
 *
 * Frigate takes a minute count on `frigate/<camera>/notifications/suspend`.
 * Lifting one has no dedicated topic — republishing `ON` to
 * `notifications/set` clears it.
 *
 * The connection is opened on first use and kept: suspending is rare, so a
 * permanent second connection alongside the source's would earn its keep only
 * on the deployments that never call it.
 */
export class FrigateNotificationSuspender extends NotificationSuspender {
  private client?: MqttClient

  constructor(
    private readonly config: CoreConfig,
    private readonly logger: Stenograph,
  ) {
    super()
  }

  private async connection(): Promise<MqttClient> {
    if (this.client?.connected) return this.client

    this.client = await mqttConnectAsync(this.config.source.frigate.broker, {
      connectTimeout: 15 * 1000,
    })
    return this.client
  }

  async suspend(camera: string, minutes: number): Promise<void> {
    const scope = camera === ALL_CAMERAS ? 'frigate' : `frigate/${camera}`
    const mqtt = await this.connection()

    if (minutes <= 0) {
      await mqtt.publishAsync(`${scope}/notifications/set`, 'ON')
      this.logger.debug(`Lifted notification suspension on ${camera}`)
      return
    }

    await mqtt.publishAsync(`${scope}/notifications/suspend`, String(minutes))
    this.logger.debug(`Suspended ${camera} notifications for ${minutes} min`)
  }

  /** Closes the connection, if one was ever opened. */
  async stop(): Promise<void> {
    await this.client?.endAsync()
    this.client = undefined
  }
}
