import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { BunFile } from 'bun'
import { defaultLogger } from 'stenograph'
import type { ImageConfig } from '../config'
import {
  resolveVideoPreset,
  shouldRetryOnCpu,
  TranscodeError,
  toProgressStep,
  transcodeImage,
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
