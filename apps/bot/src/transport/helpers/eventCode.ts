export const eventCode = (id: string | undefined | null): string =>
  id?.split('-').at(1) ?? 'unknown'
