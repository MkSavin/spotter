import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

export type BotDatabase = BunSQLiteDatabase<typeof schema> & {
  $client: Database
}

// Resolve `drizzle/` independent of cwd so the source run, the `dist/spotter`
// CLI bundle, and the Docker image all find their migrations:
//   - `src/db/../../drizzle` → apps/bot/drizzle for `bun src/index.ts` and tests
//   - `dist/../drizzle`      → apps/bot/drizzle for the bundled CLI binary
//   - `cwd/drizzle`          → /app/drizzle in the image (see apps/bot/Dockerfile)
const migrationsFolder =
  [
    path.join(import.meta.dir, '..', '..', 'drizzle'),
    path.join(import.meta.dir, '..', 'drizzle'),
    path.join(process.cwd(), 'drizzle'),
  ].find((candidate) => existsSync(candidate)) ??
  path.join(process.cwd(), 'drizzle')

export const createDatabase = (file: string): BotDatabase => {
  mkdirSync(path.dirname(file), { recursive: true })

  const sqlite = new Database(file, { create: true })

  sqlite.run('PRAGMA journal_mode = WAL;')
  sqlite.run('PRAGMA foreign_keys = ON;')

  const db = drizzle(sqlite, { schema }) as BotDatabase

  migrate(db, { migrationsFolder })

  return db
}
