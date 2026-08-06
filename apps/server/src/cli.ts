import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { program } from 'commander'
import information from '../package.json'
import { createDatabase } from './db/client'
import { tokensRepo } from './db/repository'
import { parseRole } from './helpers/role'
import { normalizeUsername } from './helpers/username'

// Bundled, `import.meta.dir` is /app, so `../data` would escape to /data.
const defaultDatabase =
  process.env.DATABASE_PATH ??
  path.join(
    [
      path.join(import.meta.dir, '..', 'data'),
      path.join(process.cwd(), 'data'),
    ].find((candidate) => existsSync(candidate)) ??
      path.join(process.cwd(), 'data'),
    'server.sqlite',
  )

/** Generates a short URL-safe code (12 base64url chars from 9 random bytes). */
const generateCode = (): string => {
  const { randomBytes } = require('node:crypto')
  return randomBytes(9).toString('base64url')
}

const deepLink = (botUsername: string, code: string): string =>
  `https://t.me/${botUsername}?start=${code}`

program
  .name('spotter-server-cli')
  .description('CLI utilities for spotter-server')
  .version(information.version)

program
  .command('sign')
  .description('Mint a single-use access code (bootstrap admins, invite users)')
  .argument('<role>', 'viewer | user | admin')
  .option('-u, --user <username>', 'bind the code to a specific @username')
  .option('-b, --bot <username>', 'bot username, to also print a deep-link')
  .option('-d, --database <path>', 'database path', defaultDatabase)
  .option('-r, --raw', 'print only the code', false)
  .action((roleArg, options) => {
    const role = parseRole(roleArg)
    if (!role) {
      console.error(`Unknown role "${roleArg}". Use: viewer | user | admin`)
      process.exit(1)
    }

    const db = createDatabase(options.database)
    const code = generateCode()
    const username = options.user ? normalizeUsername(options.user) : null

    tokensRepo.create(db, { id: code, role, username })
    db.$client.close()

    if (options.raw) {
      console.log(code)
      return
    }

    console.log(`Access code for ${role}${username ? ` (@${username})` : ''}:`)
    console.log(code)
    console.log(`Redeem with: /login ${code}`)
    if (options.bot) {
      console.log(`Deep-link:   ${deepLink(options.bot, code)}`)
    }
  })

program.parse()
