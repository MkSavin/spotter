import { describe, expect, test } from 'bun:test'
import type { Config } from '../config'
import jwt, { type JwtPayload } from '../helpers/jwt'
import { FrigateEndpoint } from './FrigateEndpoint'
import { NvrEndpoint } from './NvrEndpoint'
import { ResourceType } from './Resource'

const config = (frigate: Partial<Config['nvr']['frigate']> = {}): Config =>
  ({
    nvr: {
      frigate: {
        remoteUrl: 'https://frigate.example.com/',
        authSecret: 'topsecret',
        authUser: 'spotter',
        ...frigate,
      },
    },
  }) as Config

/** Bare concrete endpoint to exercise the abstract base defaults. */
class BareEndpoint extends NvrEndpoint {
  get hostUrl(): string {
    return this.config.nvr.frigate.remoteUrl
  }
  resolveResourceUrl(): string {
    return this.normalizedHostUrl
  }
}

describe('NvrEndpoint base', () => {
  test('normalizedHostUrl strips trailing slash and query', () => {
    const cases: [string, string][] = [
      ['https://frigate.example.com/', 'https://frigate.example.com'],
      ['https://frigate.example.com', 'https://frigate.example.com'],
      ['https://frigate.example.com/?token=x', 'https://frigate.example.com'],
      ['  https://host.tld/path/  ', 'https://host.tld/path'],
    ]

    for (const [input, expected] of cases) {
      const endpoint = new BareEndpoint(config({ remoteUrl: input }))
      expect(endpoint.normalizedHostUrl).toBe(expected)
    }
  })

  test('settleUrl substitutes host and named parameters', () => {
    const endpoint = new BareEndpoint(config())
    expect(
      endpoint.settleUrl('{host}/api/{camera}/latest.jpg', { camera: 'front' }),
    ).toBe('https://frigate.example.com/api/front/latest.jpg')
  })

  test('resolveEventCode defaults to the raw id', () => {
    expect(new BareEndpoint(config()).resolveEventCode('1700-42-abc')).toBe(
      '1700-42-abc',
    )
  })

  test('composeResourceRequest builds a GET Request at the resolved url', () => {
    const endpoint = new BareEndpoint(config())
    const request = endpoint.composeResourceRequest(ResourceType.clip, {})
    expect(request.url).toBe('https://frigate.example.com/')
    expect(request.headers.get('Authorization')).toBeNull()
  })
})

describe('FrigateEndpoint', () => {
  test('resolves clip, snapshot and latest-frame urls', () => {
    const endpoint = new FrigateEndpoint(config())

    expect(endpoint.resolveResourceUrl(ResourceType.clip, { id: 'ev-1' })).toBe(
      'https://frigate.example.com/api/events/ev-1/clip.mp4',
    )
    expect(
      endpoint.resolveResourceUrl(ResourceType.snapshot, { id: 'ev-1' }),
    ).toBe('https://frigate.example.com/api/events/ev-1/snapshot.jpg')
    expect(
      endpoint.resolveResourceUrl(ResourceType.latestFrame, { camera: 'side' }),
    ).toBe('https://frigate.example.com/api/side/latest.jpg')
  })

  test('signs a verifiable HS256 bearer token for the configured user', () => {
    const endpoint = new FrigateEndpoint(config())
    const headers = endpoint.composeHeaders() as Record<string, string>

    const token = headers.Authorization.replace('Bearer ', '')
    const payload = jwt.verify(token, 'topsecret') as JwtPayload

    expect(payload.sub).toBe('spotter')
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
  })

  test('resolveEventCode extracts the middle segment of a frigate id', () => {
    const endpoint = new FrigateEndpoint(config())
    expect(endpoint.resolveEventCode('1700000000.1-42-abc')).toBe('42')
    expect(endpoint.resolveEventCode('nosegments')).toBe('nosegments')
  })
})
