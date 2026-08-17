import { $ } from 'bun'
import type { CoreConfig } from './config'

/** ffmpeg build and the active acceleration, shown next to the version. */
export const probeDetails = async (
  config: CoreConfig,
): Promise<Record<string, string>> => {
  const details: Record<string, string> = {
    acceleration: config.video.acceleration,
  }

  const banner = await $`ffmpeg -version`
    .quiet()
    .nothrow()
    .text()
    .catch(() => '')
  const version = banner.match(/^ffmpeg version (\S+)/)?.[1]
  if (version) details.ffmpeg = version

  return details
}
