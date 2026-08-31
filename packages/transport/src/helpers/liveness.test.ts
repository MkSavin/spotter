import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { startLiveness } from './liveness'

const dirs: string[] = []
const marker = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spotter-liveness-'))
  dirs.push(dir)
  return path.join(dir, 'alive')
}

afterEach(() => {
  while (dirs.length)
    rmSync(dirs.pop() as string, { recursive: true, force: true })
})

describe('startLiveness', () => {
  test('writes the marker when the check passes', async () => {
    const file = marker()
    const stop = startLiveness({
      path: file,
      intervalMs: 10_000,
      check: () => true,
    })
    await Bun.sleep(5)
    stop()

    expect(existsSync(file)).toBe(true)
  })

  test('leaves no marker while the check fails', async () => {
    const file = marker()
    const stop = startLiveness({
      path: file,
      intervalMs: 10_000,
      check: () => false,
    })
    await Bun.sleep(5)
    stop()

    expect(existsSync(file)).toBe(false)
  })

  test('a throwing check is treated as unhealthy, not fatal', async () => {
    const file = marker()
    const stop = startLiveness({
      path: file,
      intervalMs: 10_000,
      check: () => {
        throw new Error('redis down')
      },
    })
    await Bun.sleep(5)
    stop()

    expect(existsSync(file)).toBe(false)
  })

  test('stops refreshing once stopped, so the marker goes stale', async () => {
    const file = marker()
    const stop = startLiveness({
      path: file,
      intervalMs: 10,
      check: () => true,
    })
    await Bun.sleep(25)
    const first = readFileSync(file, 'utf8')
    stop()
    await Bun.sleep(30)

    expect(readFileSync(file, 'utf8')).toBe(first)
  })
})
