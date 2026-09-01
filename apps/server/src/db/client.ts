import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export type ServerDatabase = BunSQLiteDatabase<typeof schema> & {
  $client: Database
}

const migrationsFolder =
  [
    path.join(import.meta.dir, '..', '..', 'drizzle'),
    path.join(import.meta.dir, '..', 'drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ].find((candidate) => existsSync(candidate)) ??
  path.join(process.cwd(), 'drizzle')

export const createDatabase = (file: string): ServerDatabase => {
  mkdirSync(path.dirname(file), { recursive: true })

  const sqlite = new Database(file, { create: true })

  sqlite.run('PRAGMA journal_mode = WAL;')
  // No `PRAGMA foreign_keys`: nothing in this schema declares a foreign key.
  // The relations that matter cross service boundaries — a `recipient_uuid`
  // lives in another service's database — so SQLite cannot enforce them anyway.

  const db = drizzle(sqlite, { schema }) as ServerDatabase

  migrate(db, { migrationsFolder })

  return db
}
