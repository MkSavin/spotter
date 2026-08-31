import { describe, expect, test } from 'bun:test'
import {
  resolveVideoPreset,
  shouldRetryOnCpu,
  TranscodeError,
  toProgressStep,
} from './transcode'

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
