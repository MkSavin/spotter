import { describe, expect, test } from 'bun:test'
import {
  catalogRequestStream,
  catalogUpdatedStream,
  eventStreams,
  heartbeatStream,
  mediaStreams,
  timelapseStreams,
} from '@spotter/transport'
import { downStreams, UP_STREAMS } from './streams'

describe('forwarder stream map', () => {
  test('carries everything the cloud needs from ingest', () => {
    // A stream missing here is lost silently: the ingest side keeps producing
    // and nothing on the cloud ever sees it.
    expect([...UP_STREAMS]).toEqual([
      eventStreams.event,
      catalogUpdatedStream,
      mediaStreams.mediaProcessed,
      mediaStreams.cameraProcessed,
      heartbeatStream,
      mediaStreams.mediaProgress,
      timelapseStreams.ready,
      timelapseStreams.failed,
    ])
  })

  test('carries media progress, so a pending clip shows its stage', () => {
    expect(UP_STREAMS).toContain(mediaStreams.mediaProgress)
  })

  test('carries heartbeats, so /status sees the ingest node', () => {
    expect(UP_STREAMS).toContain(heartbeatStream)
  })

  test('bridges one request pair per source', () => {
    expect(downStreams(['frigate'])).toEqual([
      mediaStreams.mediaRequest('frigate'),
      mediaStreams.cameraRequest('frigate'),
      timelapseStreams.request('frigate'),
      eventStreams.testSeed,
      catalogRequestStream,
    ])
  })

  test('bridges the timelapse round trip', () => {
    // Split deployment: the bot runs on the cloud, the adapter on ingest. Miss
    // either leg and the request is accepted and then silently never answered.
    expect(downStreams(['frigate'])).toContain(
      timelapseStreams.request('frigate'),
    )
    expect(UP_STREAMS).toContain(timelapseStreams.ready)
    expect(UP_STREAMS).toContain(timelapseStreams.failed)
  })

  test('carries the catalog request down to the adapter', () => {
    // Without it a restarted cloud consumer cannot ask for a republish, and
    // the snapshot key never crosses the forwarder.
    expect(downStreams(['frigate'])).toContain(catalogRequestStream)
  })

  test('handles several sources', () => {
    const streams = downStreams(['frigate', 'unifi'])
    expect(streams).toContain(mediaStreams.mediaRequest('unifi'))
    expect(streams).toContain(mediaStreams.cameraRequest('frigate'))
  })

  test('never mirrors a stream in both directions', () => {
    // A stream on both bridges would echo between the two Redis instances.
    const down = new Set(downStreams(['frigate']))
    for (const stream of UP_STREAMS) expect(down.has(stream)).toBe(false)
  })
})
