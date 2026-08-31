import { describe, expect, test } from 'bun:test'

import {
  safeParseTimelapseFailed,
  safeParseTimelapseReady,
  safeParseTimelapseRequest,
  timelapseStreams,
} from './timelapse'

describe('timelapse contracts', () => {
  const request = {
    source: 'frigate',
    camera: 'front',
    start: 1_700_000_000,
    end: 1_700_003_600,
    speed: 'timelapse' as const,
  }

  test('accepts a well-formed request', () => {
    expect(safeParseTimelapseRequest(request)).toEqual(request)
  })

  test('rejects an unknown speed: the adapter maps only known values', () => {
    expect(
      safeParseTimelapseRequest({ ...request, speed: 'timelapse_1000x' }),
    ).toBeNull()
  })

  test('rejects a non-positive span', () => {
    expect(safeParseTimelapseRequest({ ...request, start: 0 })).toBeNull()
  })

  test('rejects garbage off the wire', () => {
    expect(safeParseTimelapseRequest(null)).toBeNull()
    expect(safeParseTimelapseRequest({})).toBeNull()
  })

  test('ready requires a staged key', () => {
    const ready = { ...request, videoKey: 'staging/frigate/tl.mp4' }
    expect(safeParseTimelapseReady(ready)).toEqual(ready)
    expect(safeParseTimelapseReady({ ...ready, videoKey: '' })).toBeNull()
  })

  test('failed carries a known reason', () => {
    expect(
      safeParseTimelapseFailed({
        source: 'frigate',
        camera: 'front',
        reason: 'empty',
      }),
    ).not.toBeNull()
    expect(
      safeParseTimelapseFailed({
        source: 'frigate',
        camera: 'front',
        reason: 'exploded',
      }),
    ).toBeNull()
  })

  test('streams are routed per source', () => {
    expect(timelapseStreams.request('frigate-home')).toBe(
      'spotter.timelapse.request.frigate-home',
    )
    expect(timelapseStreams.ready).toBe('spotter.timelapse.ready')
    expect(timelapseStreams.failed).toBe('spotter.timelapse.failed')
  })
})
