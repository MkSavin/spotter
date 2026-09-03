import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'
import { frigateAuthHeaders, frigateUrls, settleUrl } from './frigateClient'

export type MqttConfigState =
  | { state: 'enabled'; host: string }
  | { state: 'disabled' }
  | { state: 'absent' }
  | { state: 'unknown'; reason: string }

/**
 * Reads `mqtt` out of the NVR's own config.
 *
 * Frigate publishes events over MQTT only when that section enables it, and its
 * minimal config ships with `enabled: false`. With MQTT off the NVR still looks
 * entirely healthy from outside — the UI works, the API answers, snapshots and
 * `frigate/available` are still retained on the broker — while no event is ever
 * published. That is indistinguishable from a broken adapter unless someone
 * goes and reads the config, which is exactly what this does.
 */
export const readMqttConfig = async (
  config: CoreConfig,
): Promise<MqttConfigState> => {
  try {
    const response = await fetch(
      settleUrl(frigateUrls.config, config.frigate.remoteUrl),
      {
        headers: frigateAuthHeaders(config.frigate),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok) {
      return {
        state: 'unknown',
        reason: `/api/config returned ${response.status}`,
      }
    }

    const body = (await response.json()) as {
      mqtt?: { enabled?: boolean; host?: string }
    }

    if (!body.mqtt) return { state: 'absent' }
    // Frigate reports the resolved config, so an explicit false is the only
    // way this reads as disabled.
    if (body.mqtt.enabled === false) return { state: 'disabled' }

    return { state: 'enabled', host: body.mqtt.host ?? 'unset' }
  } catch (error) {
    return { state: 'unknown', reason: String(error) }
  }
}

/**
 * Says, once at startup, whether the NVR will actually send us anything.
 *
 * Logged rather than thrown: a node with MQTT off still serves media requests
 * and timelapses, so refusing to start would take working features down over a
 * setting only the operator can change.
 */
export const reportMqttConfig = async (
  config: CoreConfig,
  logger: Stenograph,
): Promise<MqttConfigState> => {
  const state = await readMqttConfig(config)

  if (state.state === 'enabled') {
    logger.info(`NVR publishes MQTT to ${state.host}`)
  } else if (state.state === 'disabled') {
    logger.error(
      'NVR has MQTT disabled (mqtt.enabled: false) — it will never send events. Enable it in the Frigate config and restart the NVR.',
    )
  } else if (state.state === 'absent') {
    logger.error(
      'NVR config has no mqtt section — it will never send events. Add one pointing at this broker and restart the NVR.',
    )
  } else {
    logger.warn(`Could not read the NVR's MQTT config: ${state.reason}`)
  }

  return state
}
