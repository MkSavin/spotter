import { describe, expect, test } from 'bun:test'
import { type ArgSpec, parsePositional, signatureOf } from './argument'

const camera: ArgSpec = { name: 'camera', hint: 'камера', prompt: '' }
const role: ArgSpec = { name: 'role', hint: 'роль', prompt: '' }
const optional: ArgSpec = { name: 'id', optional: true, prompt: '' }

describe('signatureOf', () => {
  test('contains no HTML-significant characters', () => {
    const signature = signatureOf('user_promote', [
      { name: 'ref', hint: '@username | id', prompt: '' },
      { name: 'role', hint: 'viewer|user|admin', prompt: '' },
    ])
    expect(signature).not.toMatch(/[<>&]/)
  })

  test('marks required and optional arguments differently', () => {
    expect(signatureOf('user_promote', [camera, optional])).toBe(
      'user_promote {камера} [id]',
    )
  })

  test('a command without arguments is just its name', () => {
    expect(signatureOf('camera_list', [])).toBe('camera_list')
  })
})

describe('parsePositional', () => {
  test('maps positional words onto argument names', () => {
    expect(parsePositional('@vasya admin', [camera, role])).toEqual({
      camera: '@vasya',
      role: 'admin',
    })
  })

  test('a partial argument list fills only what was given', () => {
    expect(parsePositional('@vasya', [camera, role])).toEqual({
      camera: '@vasya',
    })
  })

  test('the last argument absorbs the remainder', () => {
    expect(parsePositional('front двор у дома', [camera, role])).toEqual({
      camera: 'front',
      role: 'двор у дома',
    })
  })

  test('empty input yields no values', () => {
    expect(parsePositional(undefined, [camera])).toEqual({})
    expect(parsePositional('   ', [camera])).toEqual({})
  })
})
