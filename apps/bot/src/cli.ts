import process from 'node:process'
import { program } from 'commander'
import information from '../package.json'
import { deepLink, generateCode } from './auth/token'
import { createDatabase } from './db/client'
import { tokensRepo } from './db/repository'
import { parseRole } from './helpers/role'
import { normalizeUsername } from './helpers/username'

program
  .name('spotter-cli')
  .description('CLI utilities for spotter')
  .version(information.version)

program
  .command('sign')
  .description('Mint a single-use access code (bootstrap admins, invite users)')
  .argument('<role>', 'viewer | user | admin')
  .option('-u, --user <username>', 'bind the code to a specific @username')
  .option('-b, --bot <username>', 'bot username, to also print a deep-link')
  .option(
    '-d, --database <path>',
    'database path',
    process.env.DATABASE_PATH || './data/bot.sqlite',
  )
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
