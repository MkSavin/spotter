import { afterEach, describe, expect, test } from 'bun:test'
import type { FrigateMediaConfig } from '../config'
import { FrigateTimelapseProvider } from './FrigateTimelapseProvider'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const config: FrigateMediaConfig = {
  remoteUrl: 'https://nvr.local',
  authSecret: 'secret',
  authUser: 'spotter',
}

const span = {
  camera: 'front',
  start: 1_700_000_000,
  end: 1_700_003_600,
  speed: 'timelapse' as const,
}

describe('FrigateTimelapseProvider', () => {
  test('starts an export with the playback factor Frigate accepts', async () => {
    let url = ''
    let init: RequestInit | undefined

    globalThis.fetch = (async (target: string, options: RequestInit) => {
      url = String(target)
      init = options
      return Response.json({ success: true, export_id: 'front_abc123' })
    }) as never

    const job = await new FrigateTimelapseProvider(config).startExport(span)

    expect(job).toEqual({ id: 'front_abc123' })
    expect(url).toBe(
      'https://nvr.local/api/export/front/start/1700000000/end/1700003600',
    )
    expect(init?.method).toBe('POST')

    const body = JSON.parse(String(init?.body))
    // `timelapse_25x` is the only timelapse value the API takes; our own
    // contract says `timelapse`, so the mapping has to happen here.
    expect(body.playback).toBe('timelapse_25x')
    expect(body.source).toBe('recordings')
  })

  test('maps realtime through unchanged', async () => {
    let body: any = null

    globalThis.fetch = (async (_target: string, options: RequestInit) => {
      body = JSON.parse(String(options.body))
      return Response.json({ export_id: 'front_x' })
    }) as never

    await new FrigateTimelapseProvider(config).startExport({
      ...span,
      speed: 'realtime',
    })

    expect(body.playback).toBe('realtime')
  })

  test('a refused export yields null rather than a bogus job', async () => {
    globalThis.fetch = (async () =>
      new Response('no recordings', { status: 404 })) as never

    expect(
      await new FrigateTimelapseProvider(config).startExport(span),
    ).toBeNull()
  })

  test('a response without an id yields null', async () => {
    globalThis.fetch = (async () => Response.json({ success: true })) as never

    expect(
      await new FrigateTimelapseProvider(config).startExport(span),
    ).toBeNull()
  })

  test('reports running while Frigate is still encoding', async () => {
    globalThis.fetch = (async () =>
      Response.json([
        { id: 'front_abc123', in_progress: true, video_path: null },
      ])) as never

    expect(
      await new FrigateTimelapseProvider(config).pollExport('front_abc123'),
    ).toEqual({ state: 'running' })
  })

  test('downloads the finished file from nginx, not the API path', async () => {
    globalThis.fetch = (async () =>
      Response.json([
        {
          id: 'front_abc123',
          in_progress: false,
          // Container-internal path: only the file name is reachable over HTTP.
          video_path: '/media/frigate/exports/front_20240115-x_abc123.mp4',
        },
      ])) as never

    const progress = await new FrigateTimelapseProvider(config).pollExport(
      'front_abc123',
    )

    expect(progress.state).toBe('ready')
    expect(progress.state === 'ready' && progress.fetch.url).toBe(
      'https://nvr.local/exports/front_20240115-x_abc123.mp4',
    )
    expect(
      progress.state === 'ready' && progress.fetch.headers.get('Authorization'),
    ).toStartWith('Bearer ')
  })

  test('an export missing from the listing is lost, not running', async () => {
    globalThis.fetch = (async () => Response.json([])) as never

    expect(
      await new FrigateTimelapseProvider(config).pollExport('front_gone'),
    ).toEqual({ state: 'lost' })
  })

  test('a failing listing throws so the caller keeps waiting', async () => {
    globalThis.fetch = (async () =>
      new Response('bad gateway', { status: 502 })) as never

    expect(
      new FrigateTimelapseProvider(config).pollExport('front_abc123'),
    ).rejects.toThrow()
  })
})
