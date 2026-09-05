import { describe, expect, test } from 'bun:test'
import type { SpotterEvent } from '@spotter/transport'
import { shouldOfferClip, shouldSayClipless } from './eventKeyboard'

const event = (overrides: Partial<SpotterEvent> = {}): SpotterEvent => ({
  id: 'cam-htriyg-1',
  source: 'frigate',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: false,
  type: 'start',
  ...overrides,
})

const ended = (hasClip: boolean): SpotterEvent =>
  event({ type: 'end', endTime: 1700000010, hasClip })

describe('shouldOfferClip', () => {
  test('an ended event advertising a clip gets the button', () => {
    expect(shouldOfferClip(ended(true))).toBe(true)
  })

  // The whole bug: a live NVR whose review never covered the object closes the
  // event with has_clip false, and the button silently stops appearing.
  test('an ended event without a clip gets no button', () => {
    expect(shouldOfferClip(ended(false))).toBe(false)
  })

  test('a running event never gets the button, clip flag or not', () => {
    expect(shouldOfferClip(event({ type: 'start', hasClip: true }))).toBe(false)
    expect(shouldOfferClip(event({ type: 'update', hasClip: true }))).toBe(
      false,
    )
  })
})

describe('shouldSayClipless', () => {
  test('an ended event without a clip is worth saying so', () => {
    expect(shouldSayClipless(ended(false))).toBe(true)
  })

  test('an ended event with a clip says nothing — the button speaks', () => {
    expect(shouldSayClipless(ended(true))).toBe(false)
  })

  test('a running event says nothing: the clip is not decided yet', () => {
    expect(shouldSayClipless(event({ type: 'start' }))).toBe(false)
    expect(shouldSayClipless(event({ type: 'update' }))).toBe(false)
  })

  // The two must never both be true, or the message offers a button while
  // saying there is nothing to offer.
  test('never both at once, on any type and flag combination', () => {
    for (const type of ['start', 'update', 'end']) {
      for (const hasClip of [true, false]) {
        const candidate = event({ type, hasClip, endTime: 1700000010 })
        expect(shouldOfferClip(candidate) && shouldSayClipless(candidate)).toBe(
          false,
        )
      }
    }
  })
})
