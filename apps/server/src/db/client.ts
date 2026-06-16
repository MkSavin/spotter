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
  sqlite.run('PRAGMA foreign_keys = ON;')

  const db = drizzle(sqlite, { schema }) as ServerDatabase

  migrate(db, { migrationsFolder })

  return db
}
