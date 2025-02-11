import process from 'process'
import Loki from 'lokijs'

export const initDatabase = (options?: Partial<any>): Loki => {
  const path = process.env.DATABASE_HOST ?? ''

  return new Loki(path, {
    autoload: true,
    autosave: true,
    autosaveInterval: 2000,
    ...options,
  })
}
