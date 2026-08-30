import type { BotContext } from '../../context'
import type { Choice, StepResult } from '../../dialog/types'

/** How a command declares one of its arguments. */
export type ArgSpec = {
  name: string
  /** Question shown when the argument has to be asked for. */
  prompt: string
  optional?: boolean
  /** Ask for this optional argument instead of falling through to a default. */
  ask?: boolean
  /** Present → offered as buttons; absent → asked for as text. */
  choices?: (context: BotContext) => Choice[] | Promise<Choice[]>
  /** Shown instead of an empty keyboard when `choices` yields nothing. */
  emptyPrompt?: string
  /** Let the user type a value the list does not offer. */
  allowManual?: boolean
  /** Validates and normalises a typed value. */
  parse?: (raw: string, context: BotContext) => StepResult
  /** Placeholder used in the generated signature, e.g. `@username`. */
  hint?: string
}

/**
 * `event_info {код}` — built from the specs so it cannot drift. Braces rather
 * than angle brackets: the signature is rendered inside HTML messages.
 */
export const signatureOf = (name: string, args: readonly ArgSpec[]): string => {
  const parts = args.map((arg) => {
    const hint = arg.hint ?? arg.name
    return arg.optional ? `[${hint}]` : `{${hint}}`
  })
  return [name, ...parts].join(' ')
}

/**
 * Splits raw command text into positional values. The last argument takes the
 * remainder, so a trailing free-text value may contain spaces.
 */
export const parsePositional = (
  raw: string | undefined,
  args: readonly ArgSpec[],
): Record<string, string> => {
  const text = (raw ?? '').trim()
  if (!text || args.length === 0) return {}

  const parts = text.split(/\s+/)
  const values: Record<string, string> = {}

  for (const [index, arg] of args.entries()) {
    if (index >= parts.length) break
    values[arg.name] =
      index === args.length - 1 ? parts.slice(index).join(' ') : parts[index]
  }

  return values
}
