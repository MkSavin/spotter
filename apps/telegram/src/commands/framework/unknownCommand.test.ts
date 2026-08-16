import { describe, expect, test } from 'bun:test'
import { commandRegistry } from '../commandList'
import { isVisible } from './access'
import { suggest } from './suggest'

/**
 * Mirrors the handler's decision: does this text get an "unknown" reply, and
 * with which suggestion? Keeps the rule under test without a live grammy bot.
 */
const decide = (
  text: string,
  role: 'ADMIN' | 'USER' | null,
): { answers: boolean; guess?: string } => {
  const typed = text.match(/^\/([A-Za-z0-9_]+)/)?.[1]?.toLowerCase()
  if (!typed) return { answers: false }
  if (commandRegistry.some((command) => command.name === typed))
    return { answers: false }
  return {
    answers: true,
    guess: suggest(
      typed,
      commandRegistry
        .filter((command) => isVisible(command.access, role))
        .map((command) => command.name),
    ),
  }
}

describe('unknown command handler', () => {
  test('stays silent for a real command', () => {
    // Regression: handlers call next(), so /status reached the unknown branch
    // and got "did you mean /status?" right after running.
    for (const name of ['status', 'start', 'login', 'camera_list'])
      expect(decide(`/${name}`, 'ADMIN').answers).toBe(false)
  })

  test('stays silent for a real command with arguments', () => {
    expect(decide('/login ABC123', null).answers).toBe(false)
    expect(decide('/user_promote @ivan', 'ADMIN').answers).toBe(false)
  })

  test('answers an unknown command with a suggestion', () => {
    expect(decide('/statsu', 'ADMIN')).toEqual({
      answers: true,
      guess: 'status',
    })
  })

  test('answers an unrelated word without guessing', () => {
    expect(decide('/deploy', 'ADMIN')).toEqual({
      answers: true,
      guess: undefined,
    })
  })

  test('ignores a command that is not at the start', () => {
    expect(decide('смотри /status выше', 'ADMIN').answers).toBe(false)
  })

  test('never suggests a command the role cannot see', () => {
    // An anonymous user must not learn that /user_promote exists.
    expect(decide('/user_promot', null).guess).toBeUndefined()
    expect(decide('/user_promot', 'ADMIN').guess).toBe('user_promote')
  })

  test('matches a real command whatever the case', () => {
    expect(decide('/STATUS', 'ADMIN').answers).toBe(false)
  })
})
