import { describe, expect, test } from 'bun:test'
import { isEncoderUnavailable } from './transcode'

describe('isEncoderUnavailable', () => {
  test('recognises a build without the hardware encoder', () => {
    // What alpine's ffmpeg actually says for hevc_nvenc.
    expect(
      isEncoderUnavailable(
        new Error(
          'ffmpeg exited with code 8: Error opening output files: Encoder not found',
        ),
      ),
    ).toBe(true)
    expect(isEncoderUnavailable(new Error('Unknown encoder hevc_nvenc'))).toBe(
      true,
    )
  })

  test('recognises a driver that will not open', () => {
    expect(
      isEncoderUnavailable(new Error('No NVENC capable devices found')),
    ).toBe(true)
    expect(
      isEncoderUnavailable(new Error('Cannot load libnvidia-encode.so.1')),
    ).toBe(true)
  })

  test('leaves a broken input alone', () => {
    // Retrying these on the CPU would fail the same way, only slower.
    expect(
      isEncoderUnavailable(
        new Error('Invalid data found when processing input'),
      ),
    ).toBe(false)
    expect(isEncoderUnavailable(new Error('No such file or directory'))).toBe(
      false,
    )
    expect(
      isEncoderUnavailable(new Error('ffmpeg timed out after 120000ms')),
    ).toBe(false)
  })

  test('survives a non-Error value', () => {
    expect(isEncoderUnavailable('Encoder not found')).toBe(true)
    expect(isEncoderUnavailable(undefined)).toBe(false)
  })
})
