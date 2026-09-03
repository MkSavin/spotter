import { describe, expect, test } from 'bun:test'
import { publishCatalog } from './publishCatalog'

type Line = { level: string; message: string }

const makeLogger = (lines: Line[]) =>
  ({
    info: (message: string) => lines.push({ level: 'info', message }),
    debug: (message: string) => lines.push({ level: 'debug', message }),
    warn: (message: string) => lines.push({ level: 'warn', message }),
    error: (message: string) => lines.push({ level: 'error', message }),
    sub() {
      return this
    },
  }) as never

const producer = {
  send: async () => 'OK',
  publish: async () => '1-0',
} as never

const catalogOf = (cameras: string[]) =>
  ({
    listCameras: async () => cameras.map((code) => ({ code, label: code })),
    listObjectTypes: async () => [{ code: 'person', label: 'person' }],
  }) as never

describe('шум каталога в логе', () => {
  test('неизменный каталог не пишет ни строки', async () => {
    const lines: Line[] = []
    const logger = makeLogger(lines)
    const memo = { value: undefined as string | undefined }
    const catalog = catalogOf(['front'])

    await publishCatalog(catalog, 'frigate', producer, logger, memo)
    lines.length = 0

    // Twelve quiet refreshes — two hours of production at the real interval.
    for (let i = 0; i < 12; i += 1) {
      await publishCatalog(catalog, 'frigate', producer, logger, memo)
    }

    expect(lines).toEqual([])
  })

  test('первая публикация — INFO: её стоит видеть', async () => {
    const lines: Line[] = []

    await publishCatalog(
      catalogOf(['front']),
      'frigate',
      producer,
      makeLogger(lines),
      { value: undefined },
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].level).toBe('info')
  })

  test('принудительная перепубликация того же — DEBUG, не INFO', async () => {
    const lines: Line[] = []
    const logger = makeLogger(lines)
    const catalog = catalogOf(['front'])

    const memo = { value: undefined as string | undefined }
    await publishCatalog(catalog, 'frigate', producer, logger, memo)
    lines.length = 0

    // Forced: publishes again even though nothing changed.
    await publishCatalog(catalog, 'frigate', producer, logger, memo, true)

    expect(lines).toHaveLength(1)
    expect(lines[0].level).toBe('debug')
  })

  test('изменившийся каталог — INFO: камеры появились или пропали', async () => {
    const lines: Line[] = []
    const logger = makeLogger(lines)
    const memo = { value: undefined as string | undefined }

    await publishCatalog(
      catalogOf(['front']),
      'frigate',
      producer,
      logger,
      memo,
    )
    lines.length = 0

    await publishCatalog(
      catalogOf(['front', 'side']),
      'frigate',
      producer,
      logger,
      memo,
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].level).toBe('info')
    expect(lines[0].message).toContain('2 cameras')
  })
})
