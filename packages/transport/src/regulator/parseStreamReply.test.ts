import { describe, expect, test } from 'bun:test'
import { parseAutoclaimReply, parseReadGroupReply } from './parseStreamReply'

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

describe('parseAutoclaimReply', () => {
  test('parses cursor and reclaimed entries', () => {
    const reply = [
      '0-0',
      [['1700000000000-0', ['value', payload]]],
      [], // deleted ids
    ]

    expect(parseAutoclaimReply('spotter.event', reply)).toEqual({
      cursor: '0-0',
      messages: [
        {
          topic: 'spotter.event',
          message: { id: '1700000000000-0', value: payload },
        },
      ],
    })
  })

  test('returns a continuation cursor when more remain', () => {
    const reply = ['1700000000123-0', [], []]
    expect(parseAutoclaimReply('s', reply).cursor).toBe('1700000000123-0')
  })

  test('returns terminal cursor for malformed replies', () => {
    expect(parseAutoclaimReply('s', null)).toEqual({
      cursor: '0-0',
      messages: [],
    })
  })
})
