import { describe, expect, test } from 'bun:test'
import {
  CALLBACK_LIMIT,
  decodeCallback,
  encodeCallback,
  newDialogId,
} from './callbackData'

describe('dialog callback data', () => {
  test('round-trips through encode and decode', () => {
    const data = {
      dialogId: 'ab12cd',
      step: 2,
      action: 'pick' as const,
      payload: '7',
    }
    expect(decodeCallback(encodeCallback(data))).toEqual(data)
  })

  test('stays within the Telegram limit for a long command', () => {
    const encoded = encodeCallback({
      dialogId: newDialogId(),
      step: 9,
      action: 'pick',
      payload: '999',
    })
    expect(encoded.length).toBeLessThanOrEqual(CALLBACK_LIMIT)
  })

  test('rejects data belonging to another feature', () => {
    expect(decodeCallback('clip:abc')).toBeUndefined()
  })

  test('rejects a malformed or unknown action', () => {
    expect(decodeCallback('dlg:ab12cd:0:explode:1')).toBeUndefined()
    expect(decodeCallback('dlg:ab12cd')).toBeUndefined()
    expect(decodeCallback('dlg:ab12cd:x:pick:1')).toBeUndefined()
  })

  test('ids are distinct so a stale keyboard is recognisable', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newDialogId()))
    expect(ids.size).toBeGreaterThan(45)
  })
})
