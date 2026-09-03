import { describe, expect, test } from 'bun:test'
import { renderSourceAlert } from './notifySourceFault'
import type { SourceAlert } from './SourceWatcher'

const alert = (over: Partial<SourceAlert> = {}): SourceAlert => ({
  source: 'frigate',
  node: 'ingest',
  fault: 'unreachable',
  forSeconds: 600,
  ...over,
})

describe('renderSourceAlert', () => {
  test('обрыв связи говорит прямо, что наблюдения нет', () => {
    // Админ должен понять последствие, а не только факт: «нет контакта» легко
    // прочитать как техническую мелочь.
    const text = renderSourceAlert(alert())

    expect(text).toContain('не выходит на связь')
    expect(text).toContain('За участком никто не следит')
  })

  test('обрыв и тишина по событиям — разные сообщения', () => {
    const broken = renderSourceAlert(alert())
    const quiet = renderSourceAlert(alert({ fault: 'silent' }))

    expect(broken).not.toBe(quiet)
    // Тишина по событиям может быть нормой, обрыв — никогда.
    expect(quiet).toContain('Возможно, всё спокойно')
  })

  test('восстановление сообщает, сколько длился обрыв', () => {
    // 60 часов — ровно столько молчал прод в сентябре 2026.
    const text = renderSourceAlert(
      alert({ recovered: true, forSeconds: 60 * 3600 }),
    )

    expect(text).toContain('снова на связи')
    expect(text).toContain('2 д')
  })

  test('длительность округляется до понятной единицы', () => {
    expect(renderSourceAlert(alert({ forSeconds: 90 }))).toContain('1 мин')
    expect(renderSourceAlert(alert({ forSeconds: 7200 }))).toContain('2 ч')
    expect(renderSourceAlert(alert({ forSeconds: 3 * 86_400 }))).toContain(
      '3 д',
    )
  })

  test('в тексте видно, какой источник и на каком узле', () => {
    const text = renderSourceAlert(
      alert({ source: 'hikvision', node: 'cloud' }),
    )

    expect(text).toContain('hikvision')
    expect(text).toContain('cloud')
  })
})
