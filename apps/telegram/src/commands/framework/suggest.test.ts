import { describe, expect, it } from 'bun:test'
import { suggest } from './suggest'

const COMMANDS = ['status', 'login', 'logout', 'camera_list', 'user_promote']

describe('suggest', () => {
  it('finds the command behind a typo', () => {
    expect(suggest('statsu', COMMANDS)).toBe('status')
    expect(suggest('camera_lst', COMMANDS)).toBe('camera_list')
  })

  it('stays silent on an unrelated word', () => {
    expect(suggest('deploy', COMMANDS)).toBeUndefined()
    expect(suggest('xyz', COMMANDS)).toBeUndefined()
  })

  it('prefers the nearest of two similar names', () => {
    expect(suggest('logi', COMMANDS)).toBe('login')
    expect(suggest('logou', COMMANDS)).toBe('logout')
  })

  it('returns nothing when there is nothing to match', () => {
    expect(suggest('status', [])).toBeUndefined()
  })
})
