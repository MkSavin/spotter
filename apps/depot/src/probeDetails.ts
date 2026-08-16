import { env } from '@spotter/transport'
import { $ } from 'bun'

/** ffmpeg build and the active acceleration, shown next to the version. */
export const probeDetails = async (): Promise<Record<string, string>> => {
  const details: Record<string, string> = {
    acceleration: env.string('VIDEO_ACCELERATION', 'cpu'),
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
