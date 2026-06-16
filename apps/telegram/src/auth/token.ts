export const deepLink = (botUsername: string, code: string): string =>
  `https://t.me/${botUsername}?start=${code}`
