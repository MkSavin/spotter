import { describe, expect, test } from 'bun:test'
import path from 'node:path'

// Each test guards one invariant listed in AGENTS.md («Инварианты»); every one
// was broken once, and each break reached production.

const root = path.resolve(import.meta.dir, '..')

const read = (file: string): Promise<string> =>
  Bun.file(path.join(root, file)).text()

const scan = async (pattern: string): Promise<string[]> =>
  Array.fromAsync(new Bun.Glob(pattern).scan(root))

describe('invariants', () => {
  test('no test replaces a module for the whole process', async () => {
    // `mock.module` never resets between files: the stub leaks into whatever
    // test runs next, and the suite passes or fails by file order.
    const offenders: string[] = []
    for (const file of await scan('{apps,packages}/*/src/**/*.test.ts')) {
      if ((await read(file)).includes('mock.module(')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('every entrypoint logs an unhandled rejection before it kills the process', async () => {
    const offenders: string[] = []
    for (const file of await scan('apps/*/src/index.ts')) {
      // `runSink` installs the guard for every adapter built on it.
      if (!/guardRejections\(|runSink\(/.test(await read(file))) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  test('an image whose service mounts a volume at /data owns it as bun', async () => {
    // Docker creates a mount point the image lacks as root; a service running
    // as bun then cannot write its job store, and loses jobs on every restart.
    const offenders: string[] = []
    for (const compose of await scan('.deployment/compose/*.yml')) {
      // One block per service: a two-space-indented key starts the next.
      const services = (await read(compose)).split(/\n(?= {2}[\w-]+:\s*$)/m)
      for (const service of services) {
        const app = service.match(
          /image:\s*ghcr\.io\/mksavin\/spotter-([\w-]+)/,
        )?.[1]
        // Named volumes only: a bind mount (`./…:/data`) takes the host's owner.
        if (!app || !/^\s+- [\w-]+:\/data\s*$/m.test(service)) continue

        const dockerfile = `apps/${app}/Dockerfile`
        if (!(await read(dockerfile)).includes('chown bun:bun /data')) {
          offenders.push(`${compose}: ${app}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('only the NVR adapter reads NVR credentials', async () => {
    const offenders: string[] = []
    for (const file of await scan('{apps,packages}/*/src/**/*.ts')) {
      if (file.startsWith('apps/frigate/') || file.endsWith('.test.ts')) {
        continue
      }
      if (
        /(env\.\w+|process\.env\[?)\(?\s*['".]?FRIGATE_/.test(await read(file))
      ) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
