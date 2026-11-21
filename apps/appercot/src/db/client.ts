import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export const createDatabase = (file: string) => {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file, { create: true })
  sqlite.run('PRAGMA journal_mode = WAL')
  sqlite.run('PRAGMA foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  const migrationsFolder =
    [
      path.resolve(import.meta.dir, '../../drizzle'),
      path.resolve(import.meta.dir, '../drizzle'),
      path.resolve('drizzle'),
    ].find(existsSync) ?? path.resolve('drizzle')
  migrate(db, { migrationsFolder })
  return db
}

export type AppercotDatabase = ReturnType<typeof createDatabase>
