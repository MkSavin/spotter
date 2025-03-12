import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config()

const args = process.argv.splice(2)
const role = args.at(0) ?? 'user'

const publicToken = jwt.sign(
  {
    role,
  },
  process.env.AUTH_SECRET || '',
  { algorithm: 'HS256' },
)

console.log(`Token for ${role}:`)
console.log(publicToken)
