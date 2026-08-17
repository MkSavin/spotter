import { describe, expect, test } from 'bun:test'
import { shouldRetryOnCpu, TranscodeError } from './transcode'

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
