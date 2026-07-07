/**
 * Short, human-facing code for an event id (`<epoch>-<code>-<rand>` from the
 * NVR): the second dash-separated segment. System-wide convention shared by
 * every service — keep it here so the format never diverges.
 */
export const eventCode = (id: string | undefined | null): string =>
  id?.split('-').at(1) ?? 'unknown'
