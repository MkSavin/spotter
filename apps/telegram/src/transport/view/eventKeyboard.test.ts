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

  test('shows a bare label until the first percentage arrives', () => {
    expect(label(videoProcessingKeyboard('staged'))).toBe('⏳ Конвертируется…')
  })

  test('ignores a percentage on the earlier stages', () => {
    // Only transcoding reports progress; fetching has none to show.
    expect(label(videoProcessingKeyboard('fetching', 40))).toBe(
      '⏳ Скачивается с камеры…',
    )
  })
})
