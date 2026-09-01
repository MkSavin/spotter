/**
 * Recipient identity normalization, shared because it is part of the contract:
 * the domain stores usernames normalized and the frontends look recipients up
 * by the same form. Two copies drifting apart would silently stop matching.
 */

/** Strips a leading `@` and case, so `@Ivan` and `ivan` are the same person. */
export const normalizeUsername = (value: string): string =>
  value.trim().replace(/^@/, '').toLowerCase()

/** Whether a reference is a numeric id rather than a username. */
export const isNumericId = (value: string): boolean =>
  /^\d+$/.test(value.trim())
