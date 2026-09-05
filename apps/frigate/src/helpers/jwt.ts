import { createHmac } from 'node:crypto'

export type JwtPayload = {
  [key: string]: any
  iss?: string | undefined
  sub?: string | undefined
  aud?: string | string[] | undefined
  exp?: number | undefined
  nbf?: number | undefined
  iat?: number | undefined
  jti?: string | undefined
}

type JwtSignOptions = {
  expiresIn?: string | number
  notBefore?: string | number
  algorithm?: 'HS256' | 'HS384' | 'HS512'
  issuer?: string
  audience?: string | string[]
  subject?: string
  jwtid?: string
}

const parseExpirationTime = (expiresIn: string | number): number => {
  if (typeof expiresIn === 'number') return expiresIn

  const match = expiresIn.match(/^(\d+)([smhd])$/)
  if (!match) throw new Error(`Invalid expiresIn format: ${expiresIn}`)

  const value = Number.parseInt(match[1], 10)
  const unit = match[2]

  const multipliers: { [key: string]: number } = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }
  return value * multipliers[unit]
}

const getHashAlgorithm = (algorithm: string): string => {
  const hashMap: { [key: string]: string } = {
    HS256: 'sha256',
    HS384: 'sha384',
    HS512: 'sha512',
  }
  return hashMap[algorithm] || 'sha256'
}

const base64UrlEncode = (input: string | Buffer): string => {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const base64UrlDecode = (input: string): Buffer => {
  let str = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = str.length % 4
  if (pad) str += '='.repeat(4 - pad)
  return Buffer.from(str, 'base64')
}

const jwtSign = (
  payload: JwtPayload,
  secret: string | Buffer,
  options?: JwtSignOptions,
): string => {
  const algorithm = options?.algorithm ?? 'HS256'
  const header: any = {
    alg: algorithm,
    typ: 'JWT',
    ...(options?.issuer && { issuer: options.issuer }),
  }

  const now = Math.floor(Date.now() / 1000)
  const signPayload: JwtPayload = {
    ...payload,
    ...(options?.subject && { sub: options.subject }),
    ...(options?.jwtid && { jti: options.jwtid }),
    ...(options?.audience && { aud: options.audience }),
    iat: now,
  }

  if (options?.expiresIn) {
    const expSeconds = parseExpirationTime(options.expiresIn)
    signPayload.exp = now + expSeconds
  }

  if (options?.notBefore) {
    const nbfSeconds = parseExpirationTime(options.notBefore)
    signPayload.nbf = now + nbfSeconds
  }

  const headerEncoded = base64UrlEncode(JSON.stringify(header))
  const payloadEncoded = base64UrlEncode(JSON.stringify(signPayload))

  const message = `${headerEncoded}.${payloadEncoded}`
  const hashAlgorithm = getHashAlgorithm(algorithm)
  const hmac = createHmac(hashAlgorithm, secret)
  hmac.update(message)
  const signature = hmac.digest('hex')
  const signatureEncoded = base64UrlEncode(signature)

  return `${message}.${signatureEncoded}`
}

const jwtDecode = (token: string) => {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token')

  const headerBuf = base64UrlDecode(parts[0])
  const payloadBuf = base64UrlDecode(parts[1])
  const signatureBuf = base64UrlDecode(parts[2])

  const header = JSON.parse(headerBuf.toString())
  const payload = JSON.parse(payloadBuf.toString())
  const signature = signatureBuf.toString() // hex string in this implementation

  return {
    header,
    payload,
    signature,
    parts: { header: parts[0], payload: parts[1], signature: parts[2] },
  }
}

const jwtVerify = (
  token: string,
  secret: string | Buffer,
  opts?: {
    issuer?: string
    audience?: string | string[]
    subject?: string
    jwtid?: string
  },
) => {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token')

  const headerPart = parts[0]
  const payloadPart = parts[1]
  const signaturePart = parts[2]

  const header = JSON.parse(base64UrlDecode(headerPart).toString())
  const payload = JSON.parse(base64UrlDecode(payloadPart).toString())

  const hashAlgorithm = getHashAlgorithm(header.alg || 'HS256')
  const hmac = createHmac(hashAlgorithm, secret)
  const message = `${headerPart}.${payloadPart}`
  hmac.update(message)
  const expectedHex = hmac.digest('hex')
  const expectedEncoded = base64UrlEncode(expectedHex)

  if (expectedEncoded !== signaturePart) throw new Error('Invalid signature')

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp !== undefined && now > payload.exp)
    throw new Error('Token expired')
  if (payload.nbf !== undefined && now < payload.nbf)
    throw new Error('Token not active')

  if (
    opts?.issuer &&
    payload.issuer !== opts.issuer &&
    header.issuer !== opts.issuer
  )
    throw new Error('Invalid issuer')

  if (opts?.audience) {
    const aud = payload.aud
    const expectedAud = opts.audience
    if (Array.isArray(expectedAud)) {
      const match = Array.isArray(aud)
        ? expectedAud.every((a) => aud.includes(a))
        : expectedAud.includes(aud)
      if (!match) throw new Error('Invalid audience')
    } else {
      if (Array.isArray(aud)) {
        if (!aud.includes(expectedAud as string))
          throw new Error('Invalid audience')
      } else {
        if (aud !== expectedAud) throw new Error('Invalid audience')
      }
    }
  }

  if (opts?.subject && payload.sub !== opts.subject)
    throw new Error('Invalid subject')
  if (opts?.jwtid && payload.jti !== opts.jwtid)
    throw new Error('Invalid jwtid')

  return payload
}

export default {
  sign: jwtSign,
  decode: jwtDecode,
  verify: jwtVerify,
}
