import path from 'node:path'
import type { Stenograph } from 'stenograph'

/** Decimal, not binary: a limit stated in MB must not be read generously. */
export const MB = 1_000_000

/** Room for each part's own container index, which the packet sizes omit. */
const HEADROOM = 0.97

/**
 * A cut time is handed back to ffmpeg slightly early: it splits at the first
 * keyframe at or after the time, and a printed timestamp may round up past
 * the frame it names.
 */
const EPSILON = 0.001

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

/** A run of frames that stream copy cannot split: a keyframe and what follows it. */
export type KeyframeInterval = { time: number; bytes: number }

type Packet = { pts_time?: string; pos?: string; flags?: string }

/** Keyframe intervals of the only stream, by byte position in the file. */
const probeIntervals = async (
  file: string,
  size: number,
  timeoutMs: number,
): Promise<KeyframeInterval[]> => {
  const result = await spawn(
    [
      'ffprobe',
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'packet=pts_time,pos,flags',
      '-of',
      'json',
      file,
    ],
    timeoutMs,
  )
  if (result.exitCode !== 0) throw fail('ffprobe', result)

  const packets = (JSON.parse(result.stdout).packets ?? []) as Packet[]
  const keys = packets
    .filter((packet) => packet.flags?.startsWith('K'))
    .map((packet) => ({
      time: Number.parseFloat(packet.pts_time ?? ''),
      pos: Number.parseInt(packet.pos ?? '', 10),
    }))
    .filter((key) => Number.isFinite(key.time) && Number.isFinite(key.pos))

  return keys.map((key, index) => ({
    time: key.time,
    bytes: (keys[index + 1]?.pos ?? size) - key.pos,
  }))
}

/**
 * Packs intervals into the fewest parts of at most `budget` bytes, in order.
 * Returns the times the later parts start at. An interval over the budget
 * gets a part of its own: only a re-encode could make it smaller.
 */
export const planCuts = (
  intervals: KeyframeInterval[],
  budget: number,
): number[] => {
  const cuts: number[] = []
  let filled = 0
  for (const { time, bytes } of intervals) {
    if (filled > 0 && filled + bytes > budget) {
      cuts.push(time)
      filled = 0
    }
    filled += bytes
  }
  return cuts
}

/** Cuts at the given times; returns the parts' paths in order. */
const segment = async (
  file: string,
  cuts: number[],
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
        '-segment_times',
        cuts.map((time) => Math.max(0, time - EPSILON).toFixed(3)).join(','),
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

/**
 * Cuts a clip larger than `limitBytes` into the fewest parts that fit it,
 * without re-encoding. Returns nothing when the clip fits or cannot be cut in
 * two. A part may still overshoot when one keyframe interval alone is larger
 * than the limit; that is reported, not fixed, since only a re-encode could.
 */
export const splitVideo = async (
  file: string,
  limitBytes: number,
  timeoutMs: number,
  logger: Stenograph,
): Promise<string[]> => {
  const size = Bun.file(file).size
  if (!(limitBytes > 0) || size <= limitBytes) return []

  const intervals = await probeIntervals(file, size, timeoutMs)
  const cuts = planCuts(intervals, limitBytes * HEADROOM)

  if (cuts.length === 0) {
    logger.warn(`Clip of ${size} bytes could not be cut: too few keyframes`)
    return []
  }

  const parts = await segment(file, cuts, timeoutMs)
  const largest = Math.max(0, ...parts.map((part) => Bun.file(part).size))

  if (largest > limitBytes) {
    logger.warn(
      `Largest part is ${largest} bytes, over the ${limitBytes} limit: keyframes are too far apart`,
    )
  }

  logger.debug(`Cut ${size} bytes into ${parts.length} parts`)
  return parts
}
