import { describe, expect, test } from 'bun:test'
import {
  type MediaRequest,
  mediaStreams,
  parseMediaRequest,
  safeParseCameraProcessed,
  safeParseCameraRequest,
  safeParseCameraStaged,
  safeParseMediaProcessed,
  safeParseMediaRequest,
  safeParseMediaStaged,
} from './mediaPipeline'

describe('media pipeline contracts', () => {
  test('MediaRequest accepts a valid payload', () => {
    const value: MediaRequest = {
      eventId: 'e1',
      source: 'frigate-home',
      want: ['clip'],
    }
    expect(safeParseMediaRequest(value)).toEqual(value)
    expect(() => parseMediaRequest(value)).not.toThrow()
  })

  test('MediaRequest rejects empty want / unknown want', () => {
    expect(
      safeParseMediaRequest({ eventId: 'e1', source: 's', want: [] }),
    ).toBeNull()
    expect(
      safeParseMediaRequest({ eventId: 'e1', source: 's', want: ['frame'] }),
    ).toBeNull()
  })

  test('MediaStaged allows partial keys', () => {
    expect(
      safeParseMediaStaged({ eventId: 'e1', source: 's', rawClipKey: 'k' }),
    ).not.toBeNull()
    expect(safeParseMediaStaged({ eventId: 'e1', source: 's' })).not.toBeNull()
  })

  test('MediaProcessed strips wire-leaked urls', () => {
    const parsed = safeParseMediaProcessed({
      eventId: 'e1',
      clipKey: 'processed/clip.mp4',
      clipUrl: 'http://nvr/leak',
    })
    expect(parsed).toEqual({ eventId: 'e1', clipKey: 'processed/clip.mp4' })
    expect(parsed).not.toHaveProperty('clipUrl')
  })

  test('CameraRequest carries optional correlation ids', () => {
    expect(
      safeParseCameraRequest({
        source: 's',
        camera: 'front',
        chatId: 1,
        messageId: 2,
      }),
    ).not.toBeNull()
    expect(
      safeParseCameraRequest({ source: 's', camera: 'front' }),
    ).not.toBeNull()
  })

  test('CameraStaged requires rawFrameKey', () => {
    expect(safeParseCameraStaged({ source: 's', camera: 'front' })).toBeNull()
    expect(
      safeParseCameraStaged({ source: 's', camera: 'front', rawFrameKey: 'k' }),
    ).not.toBeNull()
  })

  test('CameraProcessed requires frameKey', () => {
    expect(safeParseCameraProcessed({ camera: 'front' })).toBeNull()
    expect(
      safeParseCameraProcessed({ camera: 'front', frameKey: 'k' }),
    ).not.toBeNull()
  })

  test('stream name helpers route per source', () => {
    expect(mediaStreams.mediaRequest('frigate-home')).toBe(
      'spotter.media.request.frigate-home',
    )
    expect(mediaStreams.cameraRequest('test')).toBe(
      'spotter.camera.request.test',
    )
    expect(mediaStreams.mediaStaged).toBe('spotter.media.staged')
    expect(mediaStreams.mediaProcessed).toBe('spotter.event.media_processed')
    expect(mediaStreams.cameraStaged).toBe('spotter.camera.staged')
    expect(mediaStreams.cameraProcessed).toBe('spotter.camera.frame_processed')
  })
})
