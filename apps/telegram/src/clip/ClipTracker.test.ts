import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Stenograph } from 'stenograph'
import { type ClipOutcome, ClipTracker } from './ClipTracker'

const silent = new Stenograph({ transport: [] })

describe('ClipTracker', () => {
  let painted: { eventId: string; outcome: ClipOutcome }[]
  let live: ClipTracker[]

  const tracker = (timeoutMs = 10_000): ClipTracker => {
    const created = new ClipTracker(silent, {
      timeoutMs,
      render: (eventId, outcome) => painted.push({ eventId, outcome }),
    })
    live.push(created)
    return created
  }

  const tick = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms))

  beforeEach(() => {
    painted = []
    live = []
  })

  // A tracker left running would fire its timeout during a later test.
  afterEach(() => {
    for (const created of live) created.stop()
  })

  test('paints each stage of a clip it is waiting for', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.advance('e1', 'fetching')
    clips.advance('e1', 'staged')

    expect(painted).toEqual([
      { eventId: 'e1', outcome: { stage: 'fetching' } },
      { eventId: 'e1', outcome: { stage: 'staged' } },
    ])
  })

  test('ignores stages for clips nobody asked about', () => {
    const clips = tracker()
    // Media moves for ordinary events too; those must not paint a button.
    clips.advance('unrequested', 'fetching')

    expect(painted).toEqual([])
    expect(clips.size).toBe(0)
  })

  test('paints the reason when the pipeline gives up', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.fail('e1', 'Видео недоступно')

    expect(painted).toEqual([
      { eventId: 'e1', outcome: { failed: 'Видео недоступно' } },
    ])
    expect(clips.size).toBe(0)
  })

  test('reports a failure only once', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.fail('e1', 'первая')
    clips.fail('e1', 'вторая')

    expect(painted).toHaveLength(1)
  })

  test('stops tracking once the clip arrives', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.complete('e1')

    // The media edit repaints the message itself, so nothing to paint here.
    expect(painted).toEqual([])
    expect(clips.size).toBe(0)
  })

  test('gives up when nothing happens before the timeout', async () => {
    const clips = tracker(30)
    clips.begin('e1')
    await tick(60)

    expect(painted).toEqual([
      { eventId: 'e1', outcome: { failed: 'Видео готовилось слишком долго' } },
    ])
    expect(clips.size).toBe(0)
  })

  test('a stage restarts the clock', async () => {
    const clips = tracker(50)
    clips.begin('e1')
    await tick(30)
    clips.advance('e1', 'fetching')
    await tick(30)

    // Without the restart the timeout would already have fired.
    expect(painted).toEqual([{ eventId: 'e1', outcome: { stage: 'fetching' } }])
    expect(clips.size).toBe(1)
  })

  test('an arrived clip cancels the timeout', async () => {
    const clips = tracker(30)
    clips.begin('e1')
    clips.complete('e1')
    await tick(60)

    expect(painted).toEqual([])
  })

  test('paints transcoding progress as it moves', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.advance('e1', 'staged', 10)
    clips.advance('e1', 'staged', 40)

    expect(painted).toEqual([
      { eventId: 'e1', outcome: { stage: 'staged', percent: 10 } },
      { eventId: 'e1', outcome: { stage: 'staged', percent: 40 } },
    ])
  })

  test('skips a repeated percentage', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.advance('e1', 'staged', 20)
    clips.advance('e1', 'staged', 20)

    // Repainting an identical button would spend an API call for nothing.
    expect(painted).toHaveLength(1)
  })

  test('progress restarts the clock', async () => {
    const clips = tracker(50)
    clips.begin('e1')
    clips.advance('e1', 'staged', 10)
    await tick(30)
    clips.advance('e1', 'staged', 20)
    await tick(30)

    // A long transcode stays alive as long as percentages keep arriving.
    expect(clips.size).toBe(1)
    expect(painted).toHaveLength(2)
  })

  test('tracks several clips at once', () => {
    const clips = tracker()
    clips.begin('e1')
    clips.begin('e2')
    clips.advance('e2', 'staged')

    expect(painted).toEqual([{ eventId: 'e2', outcome: { stage: 'staged' } }])
    expect(clips.size).toBe(2)
  })
})
