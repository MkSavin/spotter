import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export type PwaDatabase = BunSQLiteDatabase<typeof schema> & {
  $client: Database
}

const migrationsFolder =
  [
    path.join(import.meta.dir, '..', '..', 'drizzle'),
    path.join(import.meta.dir, '..', 'drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ].find((candidate) => existsSync(candidate)) ??
  path.join(process.cwd(), 'drizzle')

export const createDatabase = (file: string): PwaDatabase => {
  mkdirSync(path.dirname(file), { recursive: true })

  const sqlite = new Database(file, { create: true })

  sqlite.run('PRAGMA journal_mode = WAL;')

  const db = drizzle(sqlite, { schema }) as PwaDatabase

  migrate(db, { migrationsFolder })

  return db
}
