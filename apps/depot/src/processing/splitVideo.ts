import path from 'node:path'
import type { Stenograph } from 'stenograph'

/** Decimal, not binary: a limit stated in MB must not be read generously. */
export const MB = 1_000_000

/** Aim below the limit: stream copy can only cut on a keyframe. */
const HEADROOM = 0.9
const SHRINK = 0.7
const ATTEMPTS = 4

type Finished = { exitCode: number; stdout: string; stderr: string }

const spawn = async (cmd: string[], timeoutMs: number): Promise<Finished> => {
  const child = Bun.spawn({
    cmd,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stdout, stderr }
}

const fail = (tool: string, { exitCode, stderr }: Finished): Error =>
  new Error(
    `${tool} exited with code ${exitCode}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`,
  )

const probeDuration = async (
  file: string,
  timeoutMs: number,
): Promise<number> => {
  const result = await spawn(
    [
      'ffprobe',
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ],
    timeoutMs,
  )
  if (result.exitCode !== 0) throw fail('ffprobe', result)

  const duration = Number.parseFloat(result.stdout)
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe reported no duration for ${file}`)
  }
  return duration
}

/** Cuts into parts of about `seconds` each; returns their paths in order. */
const segment = async (
  file: string,
  seconds: number,
  timeoutMs: number,
): Promise<string[]> => {
  const directory = path.dirname(file)
  const stem = path.basename(file, path.extname(file))
  const list = path.join(directory, `${stem}.parts.txt`)

  try {
    const result = await spawn(
      [
        'ffmpeg',
        '-hide_banner',
        '-y',
        '-i',
        file,
        '-map',
        '0',
        '-c',
        'copy',
        '-f',
        'segment',
        '-segment_time',
        seconds.toFixed(3),
        '-reset_timestamps',
        '1',
        '-segment_format_options',
        'movflags=+faststart',
        '-segment_list',
        list,
        '-segment_list_type',
        'flat',
        path.join(directory, `${stem}.part%03d.mp4`),
      ],
      timeoutMs,
    )
    if (result.exitCode !== 0) throw fail('ffmpeg', result)

    return (await Bun.file(list).text())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => path.join(directory, name))
  } finally {
    await Bun.file(list)
      .delete()
      .catch(() => undefined)
  }
}

const removeAll = (files: string[]): Promise<unknown> =>
  Promise.all(
    files.map((file) =>
      Bun.file(file)
        .delete()
        .catch(() => 0),
    ),
  )

/**
 * Cuts a clip larger than `limitBytes` into parts that fit it, without
 * re-encoding. Returns nothing when the clip fits or cannot be cut in two.
 * A part may still overshoot when one keyframe interval alone is larger than
 * the limit; that is reported, not fixed, since only a re-encode could.
 */
export const splitVideo = async (
  file: string,
  limitBytes: number,
  timeoutMs: number,
  logger: Stenograph,
): Promise<string[]> => {
  const size = Bun.file(file).size
  if (limitBytes <= 0 || size <= limitBytes) return []

  const duration = await probeDuration(file, timeoutMs)

  let budget = HEADROOM
  let parts: string[] = []
  let largest = 0

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    await removeAll(parts)

    const seconds = Math.max(1, (duration * limitBytes * budget) / size)
    parts = await segment(file, seconds, timeoutMs)
    largest = Math.max(0, ...parts.map((part) => Bun.file(part).size))

    if (largest <= limitBytes) break
    budget *= SHRINK
  }

  if (parts.length < 2) {
    await removeAll(parts)
    logger.warn(`Clip of ${size} bytes could not be cut: too few keyframes`)
    return []
  }

  if (largest > limitBytes) {
    logger.warn(
      `Largest part is ${largest} bytes, over the ${limitBytes} limit: keyframes are too far apart`,
    )
  }

  logger.debug(`Cut ${size} bytes into ${parts.length} parts`)
  return parts
}
