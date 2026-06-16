export const timeout = (time: number): Promise<Timer> =>
  new Promise((resolve) => setTimeout(resolve, time))
