import { describe, expect, test } from 'bun:test'
import { parseProbeRequest, probeStreams, safeParseProbeRequest } from './probe'

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
