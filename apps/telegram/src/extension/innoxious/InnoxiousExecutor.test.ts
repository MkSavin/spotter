import { beforeAll, describe, expect, test } from 'bun:test'
import { applicationLogger as logger } from '../../log'
import { InnoxiousExecutor } from './InnoxiousExecutor'

type Media = { naive: () => Promise<any>; accurate: () => Promise<any> }
type MediaGroup = {
  naive: () => Promise<any[]>
  accurate: () => Promise<any[]>
}

describe('InnoxiousExecutor', () => {
  beforeAll(() => {
    // TODO: disable logging globally in tests
    logger.disable()
  })

  test('single media: naive succeeds and accurate not called', async () => {
    const calls: string[] = []

    const media: Media = {
      naive: async () => {
        calls.push('naive')
        return { val: 'naive' }
      },
      accurate: async () => {
        calls.push('accurate')
        return { val: 'accurate' }
      },
    }

    const exec = new InnoxiousExecutor()

    const result = await exec.execute(media as any, async (resolver) => {
      const v: any = await resolver()
      return v.val
    })

    expect(result).toBe('naive')
    expect(calls).toEqual(['naive'])
  })

  test('single media: naive fails twice then accurate succeeds', async () => {
    const calls: string[] = []

    const media: Media = {
      naive: async () => {
        calls.push('naive')
        return { ok: false }
      },
      accurate: async () => {
        calls.push('accurate')
        return { ok: true }
      },
    }

    const exec = new InnoxiousExecutor()

    const result = await exec.execute(media as any, async (resolver) => {
      const v: any = await resolver()

      if (!v.ok) {
        throw new Error('naive failed')
      }

      return 'ok'
    })

    expect(result).toBe('ok')
    // naive should have been attempted twice before accurate
    expect(calls).toEqual(['naive', 'naive', 'accurate'])
  })

  test('single media: both strategies fail -> propagate error', async () => {
    const calls: string[] = []

    const media: Media = {
      naive: async () => {
        calls.push('naive')
        return { ok: false }
      },
      accurate: async () => {
        calls.push('accurate')
        return { ok: false }
      },
    }

    const exec = new InnoxiousExecutor()

    await expect(
      exec.execute(media as any, async (resolver) => {
        await resolver()
        throw new Error('fail')
      }),
    ).rejects.toThrow()

    expect(calls).toEqual(['naive', 'naive', 'accurate'])
  })

  test('group media: naive array succeeds and accurate not called', async () => {
    const calls: string[] = []

    const group: MediaGroup = {
      naive: async () => {
        calls.push('naive')
        return [{ ok: true }, { ok: true }]
      },
      accurate: async () => {
        calls.push('accurate')
        return [{ ok: true }, { ok: true }]
      },
    }

    const exec = new InnoxiousExecutor()

    const result = await exec.execute(group as any, async (resolver) => {
      const arr = (await resolver()) as any[]
      return arr.map((x) => (x.ok ? 'x' : ''))
    })

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(['x', 'x'])
    expect(calls).toEqual(['naive'])
  })

  test('group media: naive fails twice then accurate succeeds', async () => {
    const calls: string[] = []

    const group: MediaGroup = {
      naive: async () => {
        calls.push('naive')
        return [{ ok: false }]
      },
      accurate: async () => {
        calls.push('accurate')
        return [{ ok: true }]
      },
    }

    const exec = new InnoxiousExecutor()

    const result = await exec.execute(group as any, async (resolver) => {
      const arr = (await resolver()) as any[]
      if (!arr.every((x) => x.ok)) {
        throw new Error('naive failed')
      }
      return arr.map((x) => (x.ok ? 'ok' : ''))
    })

    expect(result).toEqual(['ok'])
    expect(calls).toEqual(['naive', 'naive', 'accurate'])
  })

  test('group media: both strategies fail -> propagate error', async () => {
    const calls: string[] = []

    const group: MediaGroup = {
      naive: async () => {
        calls.push('naive')
        return [{ ok: false }]
      },
      accurate: async () => {
        calls.push('accurate')
        return [{ ok: false }]
      },
    }

    const exec = new InnoxiousExecutor()

    await expect(
      exec.execute(group as any, async (resolver) => {
        await resolver()
        throw new Error('fail')
      }),
    ).rejects.toThrow()

    expect(calls).toEqual(['naive', 'naive', 'accurate'])
  })
})
