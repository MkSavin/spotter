import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultLogger } from 'stenograph'

import { processStaged, type Transcoders } from './processStaged'

// Injected rather than module-mocked: `mock.module` is process-wide and would
// hand this stub to transcode.test.ts whenever it happens to run later.
const transcodeVideo = mock()
const transcode = {
  video: transcodeVideo,
  image: mock(async () => undefined),
} as unknown as Transcoders

let directory = ''

const makeContext = () =>
  ({
    logger: defaultLogger,
    processedPath: 'event-media',
    filePrefix: 'event-abc',
    directory: { temp: { directory } },
    config: {
      video: { partLimitMb: 0 },
      image: {},
      directory: { cleanupStrategy: 'file-processed' },
    },
    s3: {
      file: () => ({
        exists: async () => true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        write: async () => undefined,
      }),
    },
  }) as never

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'depot-staged-'))
  transcodeVideo.mockReset()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('processStaged', () => {
  test('удаляет временные файлы после успеха', async () => {
    transcodeVideo.mockImplementation(
      async (_raw: unknown, processed: { name: string }) => {
        await Bun.write(processed.name, 'video')
      },
    )

    await processStaged(
      'video',
      'staging/clip.mp4',
      makeContext(),
      undefined,
      transcode,
    )

    expect(readdirSync(directory)).toEqual([])
  })

  test('удаляет временные файлы и после сбоя транскодирования', async () => {
    // A timed-out encode is retried, so leaving both files behind each time
    // fills the disk the NVR records onto.
    transcodeVideo.mockImplementation(async () => {
      throw new Error('ffmpeg timed out after 600000ms')
    })

    await expect(
      processStaged(
        'video',
        'staging/clip.mp4',
        makeContext(),
        undefined,
        transcode,
      ),
    ).rejects.toThrow(/timed out/)

    expect(readdirSync(directory)).toEqual([])
  })
})
