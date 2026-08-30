/**
 * Escapes a value before it goes into an HTML message. Telegram rejects the
 * whole message on a parse error, so an unescaped `<` costs the reply itself.
 */
export const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
