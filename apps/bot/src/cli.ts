import { program } from 'commander'
import jwt from 'jsonwebtoken'
import information from '../package.json'

program
  .name('spotter-cli')
  .description('CLI utilities for spotter')
  .version(information.version)

program
  .command('sign')
  .description('Sign authorization token')
  .argument('<string>', 'role')
  .option('-r, --raw', 'raw output', false)
  .option('-t, --token <string>', 'secret token', process.env.AUTH_SECRET)
  .action((role, options) => {
    const publicToken = jwt.sign(
      {
        role,
      },
      options.token || '',
      { algorithm: 'HS256' },
    )

    if (!options.raw) {
      console.log(`Token for ${role}:`)
    }
    console.log(publicToken)
  })

program.parse()
