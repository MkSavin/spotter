import { describe, expect, test } from 'bun:test'
import { stagedClipKey, stagedFrameKey, stagedSnapshotKey } from './stageMedia'

describe('staging key builders', () => {
  test('namespaces keys by prefix and source', () => {
    expect(stagedClipKey('staging', 'frigate-home', '17.1-abc')).toBe(
      'staging/frigate-home/event-17.1-abc-clip.mp4',
    )
    expect(stagedSnapshotKey('staging', 'frigate-home', '17.1-abc')).toBe(
      'staging/frigate-home/event-17.1-abc-snapshot.jpg',
    )
    expect(stagedFrameKey('staging', 'test', 'front')).toBe(
      'staging/test/camera-front-frame.jpg',
    )
  })
})
