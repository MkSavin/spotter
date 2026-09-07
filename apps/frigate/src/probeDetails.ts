import type { CoreConfig } from './config'
import { frigateFetch, frigateUrls, settleUrl } from './frigate/frigateClient'

/** The NVR build behind this adapter, shown next to the adapter version. */
export const probeDetails = async (
  config: CoreConfig,
): Promise<Record<string, string>> => {
  try {
    const response = await frigateFetch(
      config.frigate,
      settleUrl(frigateUrls.version, config.frigate.remoteUrl),
      { signal: AbortSignal.timeout(10_000) },
    )
    if (!response.ok) return {}
    const version = (await response.text()).trim()
    return version ? { NVR: version } : {}
  } catch {
    return {}
  }
}
