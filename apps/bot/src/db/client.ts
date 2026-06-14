import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export type BotDatabase = BunSQLiteDatabase<typeof schema> & {
  $client: Database
}

// First candidate is relative to this source file — stable for `bun src/index.ts`
// and tests regardless of cwd. Second covers the bundled image where index.js
// sits at /app (cwd) with `drizzle/` copied next to it (see apps/bot/Dockerfile).
const migrationsFolder =
  [
    path.join(import.meta.dir, '..', '..', 'drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ].find((candidate) => existsSync(candidate)) ??
  path.join(process.cwd(), 'drizzle')

export const createDatabase = (file: string): BotDatabase => {
  const sqlite = new Database(file, { create: true })

  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')

  const db = drizzle(sqlite, { schema }) as BotDatabase

  migrate(db, { migrationsFolder })

  return db
}
