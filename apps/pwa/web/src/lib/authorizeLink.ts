/**
 * Reads an access code handed to the app through `/authorize?code=…`.
 *
 * The bot sends this link so a code can be redeemed with one tap instead of
 * being copied by hand between two apps — the step where a person mistypes a
 * character and blames the code.
 */
export const codeFromLocation = (
  location: { pathname: string; search: string } = window.location,
): string | null => {
  if (location.pathname !== '/authorize') return null

  const code = new URLSearchParams(location.search).get('code')?.trim()
  return code ? code : null
}

/**
 * Drops the code from the address bar, keeping the app where it is.
 *
 * `replaceState`, not a navigation: the code is single-use and has no business
 * sitting in history, in a bookmark, or in a screenshot of the address bar.
 */
export const forgetCodeInUrl = (): void => {
  window.history.replaceState({}, '', '/')
}
