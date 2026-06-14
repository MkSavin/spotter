import { describe, expect, test } from 'bun:test'
import {
  parseEntries,
  parsePendingReply,
  parseReadGroupReply,
} from './parseStreamReply'

const payload = JSON.stringify({ id: 'evt-1', type: 'start' })

describe('parseReadGroupReply', () => {
  test('parses RESP2 array shape', () => {
    const reply = [
      [
        'spotter.event',
        [
          ['1700000000000-0', ['value', payload]],
          ['1700000000001-0', ['value', payload]],
        ],
      ],
    ]

    expect(parseReadGroupReply(reply)).toEqual([
      {
        topic: 'spotter.event',
        message: { id: '1700000000000-0', value: payload },
      },
      {
        topic: 'spotter.event',
        message: { id: '1700000000001-0', value: payload },
      },
    ])
  })

  test('parses RESP3 object map shape', () => {
    const reply = {
      'spotter.event': [['1700000000000-0', ['value', payload]]],
    }

    expect(parseReadGroupReply(reply)).toEqual([
      {
        topic: 'spotter.event',
        message: { id: '1700000000000-0', value: payload },
      },
    ])
  })

  test('parses RESP3 Map shape', () => {
    const reply = new Map<string, unknown>([
      ['spotter.event', [['1-0', ['value', payload]]]],
    ])

    expect(parseReadGroupReply(reply)).toEqual([
      { topic: 'spotter.event', message: { id: '1-0', value: payload } },
    ])
  })

  test('reads the value field regardless of position', () => {
    const reply = [
      ['s', [['1-0', ['ts', '123', 'value', payload, 'extra', 'x']]]],
    ]

    expect(parseReadGroupReply(reply)[0]?.message.value).toBe(payload)
  })

  test('handles multiple streams in one reply', () => {
    const reply = {
      'spotter.event': [['1-0', ['value', payload]]],
      'spotter.camera.frame_processed': [['2-0', ['value', payload]]],
    }

    const result = parseReadGroupReply(reply)
    expect(result.map((r) => r.topic)).toEqual([
      'spotter.event',
      'spotter.camera.frame_processed',
    ])
  })

  test('returns empty for nil / empty / malformed replies', () => {
    expect(parseReadGroupReply(null)).toEqual([])
    expect(parseReadGroupReply(undefined)).toEqual([])
    expect(parseReadGroupReply([])).toEqual([])
    expect(parseReadGroupReply('nope')).toEqual([])
    expect(parseReadGroupReply([['s', null]])).toEqual([])
  })

  test('missing value field yields empty string', () => {
    const reply = [['s', [['1-0', ['ts', '123']]]]]
    expect(parseReadGroupReply(reply)[0]?.message.value).toBe('')
  })
})

describe('parseEntries', () => {
  test('parses XCLAIM / XRANGE entry shape for a known stream', () => {
    const reply = [['1700000000000-0', ['value', payload]]]
    expect(parseEntries('spotter.event', reply)).toEqual([
      {
        topic: 'spotter.event',
        message: { id: '1700000000000-0', value: payload },
      },
    ])
  })

  test('returns empty for malformed entries', () => {
    expect(parseEntries('s', null)).toEqual([])
    expect(parseEntries('s', [])).toEqual([])
  })
})

describe('parsePendingReply', () => {
  test('extracts id and delivery count from extended XPENDING', () => {
    // [id, consumer, idleMs, deliveryCount]
    const reply = [
      ['1-0', 'consumer-A', 120000, 7],
      ['2-0', 'consumer-A', 5000, 1],
    ]
    expect(parsePendingReply(reply)).toEqual([
      { id: '1-0', deliveries: 7 },
      { id: '2-0', deliveries: 1 },
    ])
  })

  test('defaults missing delivery count to 0 and skips malformed rows', () => {
    const reply = [['3-0', 'c', 1], 'garbage', [null]]
    expect(parsePendingReply(reply)).toEqual([{ id: '3-0', deliveries: 0 }])
  })

  test('returns empty for nil / non-array replies', () => {
    expect(parsePendingReply(null)).toEqual([])
    expect(parsePendingReply('nope')).toEqual([])
  })
})
