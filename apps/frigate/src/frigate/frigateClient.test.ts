import { describe, expect, test } from 'bun:test'
import type { FrigateMediaConfig } from '../config'
import jwt, { type JwtPayload } from '../helpers/jwt'
import {
  frigateMediaRequest,
  frigateUrls,
  mintFrigateJwt,
  normalizeHostUrl,
  settleUrl,
} from './frigateClient'

const config: FrigateMediaConfig = {
  remoteUrl: 'https://frigate.example.com/',
  authSecret: 'topsecret',
  authUser: 'spotter',
}

describe('frigateClient', () => {
  test('normalizeHostUrl strips trailing slash and query', () => {
    const cases: [string, string][] = [
      ['https://frigate.example.com/', 'https://frigate.example.com'],
      ['https://frigate.example.com', 'https://frigate.example.com'],
      ['https://frigate.example.com/?token=x', 'https://frigate.example.com'],
      ['  https://host.tld/path/  ', 'https://host.tld/path'],
    ]
    for (const [input, expected] of cases) {
      expect(normalizeHostUrl(input)).toBe(expected)
    }
  })

  test('settleUrl substitutes host and named parameters', () => {
    expect(
      settleUrl(frigateUrls.latestFrame, config.remoteUrl, { camera: 'front' }),
    ).toBe('https://frigate.example.com/api/front/latest.jpg')
  })

  test('resolves clip, snapshot and latest-frame urls', () => {
    expect(
      frigateMediaRequest(config, frigateUrls.clip, { id: 'ev-1' }).url,
    ).toBe('https://frigate.example.com/api/events/ev-1/clip.mp4')
    expect(
      frigateMediaRequest(config, frigateUrls.snapshot, { id: 'ev-1' }).url,
    ).toBe('https://frigate.example.com/api/events/ev-1/snapshot.jpg')
    expect(
      frigateMediaRequest(config, frigateUrls.latestFrame, { camera: 'side' })
        .url,
    ).toBe('https://frigate.example.com/api/side/latest.jpg')
  })

  test('signs a verifiable HS256 bearer token for the configured user', () => {
    const token = mintFrigateJwt(config)
    const payload = jwt.verify(token, 'topsecret') as JwtPayload
    expect(payload.sub).toBe('spotter')
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
  })

  test('media request carries the bearer header', () => {
    const request = frigateMediaRequest(config, frigateUrls.clip, { id: 'x' })
    expect(request.headers.get('Authorization')).toMatch(/^Bearer /)
  })
})

describe('recording frame url', () => {
  test('addresses the camera and the frame time', () => {
    expect(
      settleUrl(frigateUrls.recordingFrame, 'https://frigate.example.com', {
        camera: 'front',
        time: '1788114532.100829',
      }),
    ).toBe(
      'https://frigate.example.com/api/front/recordings/1788114532.100829/snapshot.jpg',
    )
  })
})
