import { describe, expect, test } from 'bun:test'
import { videoProcessingKeyboard } from './eventKeyboard'

const label = (keyboard: ReturnType<typeof videoProcessingKeyboard>): string =>
  keyboard.inline_keyboard[0]?.[0]?.text ?? ''

describe('videoProcessingKeyboard', () => {
  test('shows the percentage while transcoding', () => {
    expect(label(videoProcessingKeyboard('staged', 40))).toBe(
      '⏳ Конвертируется… 40%',
    )
  })

  test('reads "queued" until the first percentage arrives', () => {
    // No percent yet means depot has not started the job — ffmpeg reports one
    // as soon as it does, so "converting" would be a lie while it waits.
    expect(label(videoProcessingKeyboard('staged'))).toBe('⏳ В очереди…')
  })

  test('ignores a percentage on the earlier stages', () => {
    // Only transcoding reports progress; fetching has none to show.
    expect(label(videoProcessingKeyboard('fetching', 40))).toBe(
      '⏳ Скачивается с камеры…',
    )
  })
})
