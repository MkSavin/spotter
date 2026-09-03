import { describe, expect, test } from 'bun:test'
import {
  parseProbeRequest,
  probeStreams,
  safeParseProbeRequest,
  safeParseProbeResult,
} from './probe'

describe('probeRequest', () => {
  test('fills in the defaults a caller can omit', () => {
    const request = parseProbeRequest({ source: 'frigate' })

    expect(request.label).toBe('person')
    expect(request.score).toBe(0.9)
    // A single frame would be discarded by the NVR as noise.
    expect(request.frames).toBe(30)
  })

  test('keeps what the caller did specify', () => {
    const request = parseProbeRequest({
      source: 'frigate',
      camera: 'front',
      label: 'car',
      frames: 90,
      score: 0.55,
    })

    expect(request.camera).toBe('front')
    expect(request.label).toBe('car')
    expect(request.frames).toBe(90)
    expect(request.score).toBe(0.55)
  })

  test('rejects a score outside 0..1', () => {
    expect(safeParseProbeRequest({ source: 'frigate', score: 1.5 })).toBeNull()
  })

  test('rejects a frame count that cannot produce anything', () => {
    expect(safeParseProbeRequest({ source: 'frigate', frames: 0 })).toBeNull()
  })

  test('rejects a request with no source to route it to', () => {
    expect(safeParseProbeRequest({ camera: 'front' })).toBeNull()
  })

  test('routes per source, like every other adapter request', () => {
    expect(probeStreams.request('frigate')).toBe(
      'spotter.probe.request.frigate',
    )
  })
})

describe('probeResult', () => {
  test('успешный ответ несёт камеру и кадры', () => {
    const result = safeParseProbeResult({
      source: 'frigate',
      staged: true,
      camera: 'front',
      frames: 30,
    })

    expect(result).toMatchObject({ staged: true, camera: 'front', frames: 30 })
  })

  test('отказ несёт причину, а не только флаг', () => {
    // Без причины пользователю нечего делать: он видит «не сработало» и всё.
    const result = safeParseProbeResult({
      source: 'frigate',
      staged: false,
      reason: 'Детектор не запущен',
    })

    expect(result?.reason).toBe('Детектор не запущен')
  })

  test('chatId переживает дорогу, чтобы ответ дошёл в тот же чат', () => {
    expect(
      safeParseProbeResult({ source: 'frigate', staged: true, chatId: 42 })
        ?.chatId,
    ).toBe(42)
  })

  test('ответ без источника отбрасывается', () => {
    expect(safeParseProbeResult({ staged: true })).toBeNull()
  })

  test('результат едет одним стримом на все источники', () => {
    // Потребитель один — доставляющая сторона; делить по источникам незачем.
    expect(probeStreams.result).toBe('spotter.probe.result')
  })
})
