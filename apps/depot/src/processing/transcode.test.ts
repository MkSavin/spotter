import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { BunFile } from 'bun'
import { defaultLogger } from 'stenograph'
import type { ImageConfig } from '../config'
import {
  describeFailure,
  resolveVideoPreset,
  shouldRetryOnCpu,
  TranscodeError,
  toProgressStep,
  transcodeImage,
  transcodeVideo,
} from './transcode'

defaultLogger.disable()

describe('toProgressStep', () => {
  test('rounds down to tens', () => {
    expect(toProgressStep(47.31450109264421)).toBe(40)
    expect(toProgressStep(9.9)).toBe(0)
    expect(toProgressStep(70)).toBe(70)
  })

  test('clamps what ffmpeg reports out of range', () => {
    // Percent is derived from a duration estimate, so it can overshoot.
    expect(toProgressStep(104)).toBe(100)
    expect(toProgressStep(-3)).toBe(0)
  })
})

describe('shouldRetryOnCpu', () => {
  test('retries when ffmpeg died before the first frame', () => {
    // Both hardware failures look like this: the encoder is missing, or it is
    // there but the device will not open. Either way the CPU may succeed.
    expect(
      shouldRetryOnCpu(
        new TranscodeError(
          'ffmpeg exited with code 8: Encoder not found',
          0,
          false,
        ),
      ),
    ).toBe(true)
    expect(
      shouldRetryOnCpu(
        new TranscodeError(
          'ffmpeg exited with code 255: Conversion failed!',
          0,
          false,
        ),
      ),
    ).toBe(true)
  })

  test('gives up once frames were produced', () => {
    // Encoding had started, so the device works — the input is at fault and
    // the CPU would hit the same wall.
    expect(
      shouldRetryOnCpu(new TranscodeError('Invalid data found', 42, false)),
    ).toBe(false)
  })

  test('gives up on a timeout', () => {
    // The CPU is slower, so a clip that already ran out of time will not make it.
    expect(
      shouldRetryOnCpu(new TranscodeError('ffmpeg timed out', 0, true)),
    ).toBe(false)
  })

  test('gives up on anything that is not a transcode failure', () => {
    expect(shouldRetryOnCpu(new Error('Clip files is not assigned'))).toBe(
      false,
    )
    expect(shouldRetryOnCpu(undefined)).toBe(false)
  })
})

describe('describeFailure', () => {
  test('carries the stderr tail and the input ffmpeg reported', () => {
    // The line naming the cause never reaches `error.message`, which is why
    // exit 255 alone could not tell a busy GPU from an unsupported input.
    const error = new TranscodeError(
      'ffmpeg exited with code 255: Conversion failed!',
      0,
      false,
      [
        '[h264_nvenc @ 0x5] OpenEncodeSessionEx failed: out of memory (10)',
        'Conversion failed!',
      ],
      'h264 (High) · yuv420p · 00:00:21.53',
    )

    expect(describeFailure(error)).toEqual({
      frames: 0,
      input: 'h264 (High) · yuv420p · 00:00:21.53',
      output: [
        '[h264_nvenc @ 0x5] OpenEncodeSessionEx failed: out of memory (10)',
        'Conversion failed!',
      ],
    })
  })

  test('omits what ffmpeg never got far enough to say', () => {
    expect(describeFailure(new TranscodeError('died', 0, false))).toEqual({
      frames: 0,
    })
  })

  test('ignores anything that is not a transcode failure', () => {
    expect(describeFailure(new Error('nope'))).toBeUndefined()
  })
})

describe('resolveVideoPreset', () => {
  test('cuda carries an explicit speed preset and rate control', () => {
    // Without these nvenc defaults to p4/medium, losing to the CPU on a
    // small Pascal card.
    const preset = resolveVideoPreset('cuda', 'h264', 'normal')

    expect(preset.outputParameters).toContain('-preset:v p2')
    expect(preset.outputParameters).toContain('-cq:v 28')
    expect(preset.outputParameters).toContain('-c:v h264_nvenc')
  })

  test('cuda quality steps map to different presets', () => {
    const best = resolveVideoPreset('cuda', 'hevc', 'best')
    const awful = resolveVideoPreset('cuda', 'hevc', 'awful')

    expect(best.outputParameters).toContain('-preset:v p4')
    expect(awful.outputParameters).toContain('-preset:v p1')
  })

  test('cuda decodes on the GPU without pinning frames to VRAM', () => {
    // A cuda output format needs a cuda filter chain; without one ffmpeg
    // cannot negotiate a format and silently drops to the CPU.
    const preset = resolveVideoPreset('cuda', 'h264', 'normal')

    expect(preset.inputParameters).toContain('-hwaccel cuda')
    expect(preset.inputParameters).not.toContain('-hwaccel_output_format cuda')
  })

  test('vaapi gets a quality knob too', () => {
    const preset = resolveVideoPreset('vaapi', 'h264', 'good')

    expect(preset.outputParameters).toContain('-global_quality 26')
  })

  test('cpu keeps its own preset mapping', () => {
    const preset = resolveVideoPreset('cpu', 'h264', 'awful')

    expect(preset.outputParameters).toContain('-preset:v ultrafast')
    expect(preset.outputParameters).toContain('-c:v libx264')
  })

  test('cpu bounds the size with a CRF, and hevc gets its own scale', () => {
    // Without a CRF x264 encodes at its default 23 in the camera's own
    // resolution: a six-minute event came out at hundreds of megabytes.
    expect(
      resolveVideoPreset('cpu', 'h264', 'normal').outputParameters,
    ).toContain('-crf:v 26')
    // x265 rates the same look several points higher than x264.
    expect(
      resolveVideoPreset('cpu', 'hevc', 'normal').outputParameters,
    ).toContain('-crf:v 30')
  })

  test('no streaming tune: it drops B-frames and lookahead for nothing', () => {
    for (const codec of ['h264', 'hevc'] as const) {
      expect(
        resolveVideoPreset('cpu', codec, 'normal').outputParameters,
      ).not.toContain('-tune:v zerolatency')
    }
  })

  test('every preset puts a keyframe every two seconds and the index up front', () => {
    for (const acceleration of ['cpu', 'cuda', 'vaapi', 'videotoolbox']) {
      const { outputParameters } = resolveVideoPreset(
        acceleration,
        'h264',
        'normal',
      )
      // Where a part can be cut without a re-encode. By time, not frames:
      // the frame rate may be capped or left alone.
      expect(outputParameters).toContain(
        '-force_key_frames expr:gte(t,n_forced*2)',
      )
      // Telegram starts playing a video only once it has the index.
      expect(outputParameters).toContain('-movflags +faststart')
    }
  })

  test('the shape caps height and frame rate, scaling down but never up', () => {
    const { outputParameters } = resolveVideoPreset(
      'cpu',
      'h264',
      'normal',
      0,
      {
        maxHeight: 720,
        maxFps: 15,
      },
    )

    expect(outputParameters).toContain(
      '-vf fps=15,scale=-2:trunc(min(720\\,ih)/2)*2',
    )
  })

  test('vaapi scales on the device, where its frames live', () => {
    const { outputParameters } = resolveVideoPreset(
      'vaapi',
      'h264',
      'normal',
      0,
      {
        maxHeight: 720,
        maxFps: 15,
      },
    )

    expect(outputParameters).toContain(
      '-vf fps=15,scale_vaapi=w=-2:h=trunc(min(720\\,ih)/2)*2',
    )
    // Software pixel formats mean nothing to a VAAPI surface.
    expect(outputParameters).not.toContain('-pix_fmt yuv420p')
  })

  test('a zero cap leaves that dimension alone', () => {
    expect(
      resolveVideoPreset('cpu', 'h264', 'normal', 0, {
        maxHeight: 0,
        maxFps: 10,
      }).outputParameters,
    ).toContain('-vf fps=10')
    expect(
      resolveVideoPreset('cpu', 'h264', 'normal', 0, {
        maxHeight: 0,
        maxFps: 0,
      }).outputParameters.some((option) => option.startsWith('-vf')),
    ).toBe(false)
  })
})

describe('transcodeImage', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spotter-transcode-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  // A 2x2 PNG: small enough to inline, and a format change proves conversion
  // actually ran rather than the bytes being copied through.
  const PNG_2X2 =
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8z4APMOGVHVbSAEZ8ARGYtus0AAAAAElFTkSuQmCC'

  const write = async (name: string) => {
    const file = Bun.file(path.join(dir, name))
    await file.write(Buffer.from(PNG_2X2, 'base64'))
    return file
  }

  const config = (over: Partial<ImageConfig> = {}): ImageConfig =>
    ({ quality: 'normal', skipConversion: false, ...over }) as ImageConfig

  test('converts a source image to jpeg', async () => {
    const raw = await write('convert-raw.png')
    const processed = Bun.file(path.join(dir, 'convert-out.jpg'))

    await transcodeImage(raw, processed, config(), defaultLogger)

    expect(await processed.exists()).toBe(true)
    const meta = await Bun.file(processed.name as string)
      .image()
      .metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(2)
    expect(meta.height).toBe(2)
  })

  test('copies the source untouched when conversion is skipped', async () => {
    const raw = await write('skip-raw.png')
    const processed = Bun.file(path.join(dir, 'skip-out.png'))

    await transcodeImage(
      raw,
      processed,
      config({ skipConversion: true }),
      defaultLogger,
    )

    // Still a PNG: the flag has to bypass the encoder entirely.
    const meta = await Bun.file(processed.name as string)
      .image()
      .metadata()
    expect(meta.format).toBe('png')
    expect(await processed.bytes()).toEqual(await raw.bytes())
  })

  test('a lower quality setting yields a smaller file', async () => {
    const raw = await write('quality-raw.png')
    const best = Bun.file(path.join(dir, 'quality-best.jpg'))
    const awful = Bun.file(path.join(dir, 'quality-awful.jpg'))

    await transcodeImage(raw, best, config({ quality: 'best' }), defaultLogger)
    await transcodeImage(
      raw,
      awful,
      config({ quality: 'awful' }),
      defaultLogger,
    )

    expect(awful.size).toBeLessThan(best.size)
  })

  test('rejects when the file paths are not assigned', async () => {
    const raw = await write('unassigned-raw.png')
    // An in-memory blob carries no path for the encoder to write to.
    const detached = new Blob([]) as unknown as BunFile
    expect(
      transcodeImage(raw, detached, config(), defaultLogger),
    ).rejects.toThrow('Image files is not assigned correctly')
  })

  test('rejects on a source that is not an image', async () => {
    const raw = Bun.file(path.join(dir, 'broken-raw.jpg'))
    await raw.write('<html>404 not found</html>')
    const processed = Bun.file(path.join(dir, 'broken-out.jpg'))

    // Cameras do hand back error pages; the failure has to surface, not pass
    // a corrupt file downstream.
    expect(
      transcodeImage(raw, processed, config(), defaultLogger),
    ).rejects.toThrow()
  })
})

// Real ffmpeg: an encoder rejects an unknown preset only at runtime, and the
// rejection looks like any other frame-0 failure. CI has no ffmpeg.
describe.skipIf(!Bun.which('ffmpeg'))('transcodeVideo on the CPU', () => {
  const qualities = ['best', 'good', 'normal', 'bad', 'awful'] as const
  let workdir = ''
  let source = ''

  beforeAll(async () => {
    workdir = mkdtempSync(path.join(tmpdir(), 'spotter-cpu-'))
    source = path.join(workdir, 'source.mp4')
    const child = Bun.spawn({
      cmd: [
        'ffmpeg',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=320x240:rate=10',
        '-pix_fmt',
        'yuv420p',
        '-y',
        source,
      ],
    })
    await child.exited
  })

  afterAll(() => rmSync(workdir, { recursive: true, force: true }))

  for (const codec of ['h264', 'hevc'] as const) {
    for (const quality of qualities) {
      test(`${codec} at "${quality}" encodes`, async () => {
        const processed = Bun.file(
          path.join(workdir, `${codec}-${quality}.mp4`),
        )

        await transcodeVideo(
          Bun.file(source),
          processed,
          {
            acceleration: 'cpu',
            codec,
            quality,
            device: 0,
            skipConversion: false,
            timeoutMs: 60_000,
            concurrency: 1,
            partLimitMb: 0,
            maxHeight: 0,
            maxFps: 0,
          },
          defaultLogger,
        )

        expect(processed.size).toBeGreaterThan(0)
      })
    }
  }

  const probe = async (
    file: string,
  ): Promise<{ height: number; fps: number; keyframes: number[] }> => {
    const child = Bun.spawn({
      cmd: [
        'ffprobe',
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=height,avg_frame_rate:packet=pts_time,flags',
        '-of',
        'json',
        file,
      ],
      stdout: 'pipe',
    })
    const report = JSON.parse(await new Response(child.stdout).text())
    const [num, den] = String(report.streams[0].avg_frame_rate).split('/')
    return {
      height: report.streams[0].height,
      fps: Number(num) / Number(den || 1),
      keyframes: (report.packets as { pts_time: string; flags: string }[])
        .filter((packet) => packet.flags.startsWith('K'))
        .map((packet) => Number(packet.pts_time)),
    }
  }

  test('the shape is applied: 720p source lands at 480p and 10 fps, keyframes 2 s apart', async () => {
    const tall = path.join(workdir, 'tall.mp4')
    const made = Bun.spawn({
      cmd: [
        'ffmpeg',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=6:size=1280x720:rate=25',
        '-pix_fmt',
        'yuv420p',
        '-y',
        tall,
      ],
    })
    await made.exited
    const processed = Bun.file(path.join(workdir, 'shaped.mp4'))

    await transcodeVideo(
      Bun.file(tall),
      processed,
      {
        acceleration: 'cpu',
        codec: 'h264',
        quality: 'awful',
        device: 0,
        skipConversion: false,
        timeoutMs: 60_000,
        concurrency: 1,
        partLimitMb: 0,
        maxHeight: 480,
        maxFps: 10,
      },
      defaultLogger,
    )

    const shaped = await probe(processed.name as string)
    expect(shaped.height).toBe(480)
    expect(shaped.fps).toBeCloseTo(10, 1)
    expect(shaped.keyframes).toEqual([0, 2, 4])
  })

  test('a small source is never scaled up', async () => {
    const processed = Bun.file(path.join(workdir, 'kept.mp4'))

    await transcodeVideo(
      Bun.file(source),
      processed,
      {
        acceleration: 'cpu',
        codec: 'h264',
        quality: 'awful',
        device: 0,
        skipConversion: false,
        timeoutMs: 60_000,
        concurrency: 1,
        partLimitMb: 0,
        maxHeight: 720,
        maxFps: 15,
      },
      defaultLogger,
    )

    expect((await probe(processed.name as string)).height).toBe(240)
  })
})
