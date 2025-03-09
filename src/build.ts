import dotenv from 'dotenv'
import information from '../package.json'

dotenv.config()

Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  env: 'disable',
}).then((result) => {
  if (result.success) {
    console.log(`${information.name} successfully built`)
    console.log('')
    console.log('➜  Output:')
    result.outputs.forEach((entry) => {
      console.log(`   - ${entry.path} [${entry.size} bytes]`)
    })
    console.log('')
    process.exit(0)
  } else {
    console.log(`Error while building ${information.name}`)
    console.log('')
    console.log('➜  Logs:')
    console.log(...result.logs)
    console.log('')
    process.exit(1)
  }
})
