import { describe, expect, test } from 'bun:test'
import { CommandThrottle } from './throttle'

describe('CommandThrottle', () => {
  test('the first run of a command is always allowed', () => {
    const throttle = new CommandThrottle(3000)
    expect(throttle.remaining('c1', 'camera_snapshot')).toBe(0)
  })

  test('a repeat inside the window has to wait', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'camera_snapshot', 1000)
    expect(throttle.remaining('c1', 'camera_snapshot', 3000, 2000)).toBe(2000)
  })

  test('the window lapses', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'camera_snapshot', 1000)
    expect(throttle.remaining('c1', 'camera_snapshot', 3000, 4500)).toBe(0)
  })

  test('chats are gated independently', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'camera_snapshot', 1000)
    // One person spamming must not silence anybody else.
    expect(throttle.remaining('c2', 'camera_snapshot', 3000, 1500)).toBe(0)
  })

  test('commands are gated independently within a chat', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'camera_snapshot', 1000)
    expect(throttle.remaining('c1', 'timelapse', 3000, 1500)).toBe(0)
  })

  test('a per-command cooldown overrides the default', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'timelapse', 1000)
    // An export costs the NVR minutes, so its gate outlasts the default.
    expect(throttle.remaining('c1', 'timelapse', 60_000, 5000)).toBe(56_000)
  })

  test('sweep drops lapsed entries and keeps live ones', () => {
    const throttle = new CommandThrottle(3000)
    throttle.mark('c1', 'old', 0)
    throttle.mark('c2', 'fresh', 9000)

    expect(throttle.sweep(3000, 10_000)).toBe(1)
    expect(throttle.size).toBe(1)
    expect(throttle.remaining('c2', 'fresh', 3000, 10_000)).toBeGreaterThan(0)
  })
})
