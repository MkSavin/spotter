import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultLogger } from 'stenograph'
import { splitVideo } from './splitVideo'

defaultLogger.disable()

// Real ffmpeg: whether a stream copy lands on keyframes is exactly what a stub
// would hide. CI has no ffmpeg, so there it is skipped.
const missing = !Bun.which('ffmpeg') || !Bun.which('ffprobe')

let directory: string

/** Noise keeps the bitrate up, so a short clip is still worth cutting. */
const makeClip = async (name: string, gop: number): Promise<string> => {
  const file = path.join(directory, name)
  const child = Bun.spawn({
    cmd: [
      'ffmpeg',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=duration=12:size=640x360:rate=25,noise=alls=40:allf=t',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-g',
      String(gop),
      '-pix_fmt',
      'yuv420p',
      '-y',
      file,
    ],
    stderr: 'pipe',
  })
  if ((await child.exited) !== 0) {
    throw new Error(await new Response(child.stderr).text())
  }
  return file
}

const duration = async (file: string): Promise<number> => {
  const child = Bun.spawn({
    cmd: [
      'ffprobe',
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ],
    stdout: 'pipe',
  })
  return Number.parseFloat(await new Response(child.stdout).text())
}

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'spotter-split-'))
})

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe.skipIf(missing)('splitVideo', () => {
  test('cuts a clip over the limit into parts that fit it', async () => {
    const clip = await makeClip('dense.mp4', 25)
    const size = Bun.file(clip).size
    const limit = Math.ceil(size / 3)

    const parts = await splitVideo(clip, limit, 60_000, defaultLogger)

    expect(parts.length).toBeGreaterThanOrEqual(3)
    for (const part of parts) {
      expect(Bun.file(part).size).toBeLessThanOrEqual(limit)
    }

    // Nothing lost at the cuts: the parts still add up to the whole clip.
    const total = (await Promise.all(parts.map(duration))).reduce(
      (sum, value) => sum + value,
      0,
    )
    expect(total).toBeCloseTo(await duration(clip), 0)
  })

  test('leaves a clip within the limit alone', async () => {
    const clip = await makeClip('small.mp4', 25)

    expect(
      await splitVideo(clip, Bun.file(clip).size, 60_000, defaultLogger),
    ).toEqual([])
  })

  test('gives up rather than return one part when there is nowhere to cut', async () => {
    // A single keyframe: stream copy has no second place to start a part.
    const clip = await makeClip('sparse.mp4', 1000)

    const parts = await splitVideo(
      clip,
      Math.ceil(Bun.file(clip).size / 3),
      60_000,
      defaultLogger,
    )

    expect(parts).toEqual([])
  })

  test('a zero limit never cuts', async () => {
    const clip = await makeClip('off.mp4', 25)

    expect(await splitVideo(clip, 0, 60_000, defaultLogger)).toEqual([])
  })
})
