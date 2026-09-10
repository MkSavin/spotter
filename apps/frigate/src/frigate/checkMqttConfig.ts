import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'
import { frigateFetch, frigateUrls, settleUrl } from './frigateClient'

export type MqttConfigState =
  | { state: 'enabled'; host: string }
  | { state: 'disabled' }
  | { state: 'absent' }
  | { state: 'unknown'; reason: string }

/**
 * With MQTT off the NVR looks entirely healthy yet publishes nothing.
 * See docs/foundings/frigate-api-quirks.md.
 */
export const readMqttConfig = async (
  config: CoreConfig,
): Promise<MqttConfigState> => {
  try {
    const response = await frigateFetch(
      config.frigate,
      settleUrl(frigateUrls.config, config.frigate.remoteUrl),
      { signal: AbortSignal.timeout(10_000) },
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
