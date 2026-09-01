import { describe, expect, test } from 'bun:test'
import type { Heartbeat } from '../schema/heartbeat'
import { startHeartbeat } from './publishHeartbeat'

const collector = () => {
  const beats: Heartbeat[] = []
  return {
    beats,
    producer: {
      publish: async (_stream: string, payload: unknown) => {
        beats.push(payload as Heartbeat)
        return '1-0'
      },
    },
  }
}

describe('startHeartbeat queue depth', () => {
  test('carries the depths it was given', async () => {
    const { beats, producer } = collector()

    startHeartbeat(producer, {
      service: 'depot',
      version: '1.0.0',
      queues: async () => [
        { stream: 'spotter.media.staged', lag: 4, pending: 1 },
      ],
    })()

    await Bun.sleep(10)
    expect(beats[0]?.queues).toHaveLength(1)
    expect(beats[0]?.queues?.[0].lag).toBe(4)
  })

  test('omits the field entirely when every queue is quiet', async () => {
    const { beats, producer } = collector()

    startHeartbeat(producer, {
      service: 'depot',
      version: '1.0.0',
      queues: async () => [],
    })()

    await Bun.sleep(10)
    expect(beats[0]?.queues).toBeUndefined()
  })

  test('a failing probe costs the depths, not the beat', async () => {
    // Liveness is the heartbeat's real job; depth is a passenger.
    const { beats, producer } = collector()

    startHeartbeat(producer, {
      service: 'depot',
      version: '1.0.0',
      queues: async () => {
        throw new Error('redis unreachable')
      },
    })()

    await Bun.sleep(10)
    expect(beats).toHaveLength(1)
    expect(beats[0]?.service).toBe('depot')
    expect(beats[0]?.queues).toBeUndefined()
  })

  test('a service that consumes nothing reports no queues', async () => {
    const { beats, producer } = collector()

    startHeartbeat(producer, { service: 'forwarder', version: '1.0.0' })()

    await Bun.sleep(10)
    expect(beats[0]?.queues).toBeUndefined()
  })
})
