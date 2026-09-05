import { env } from '../helpers/env'

/** The S3 connection every service reads from the same four variables. */
export type S3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
}

/**
 * Reads the shared S3_* env block. Empty defaults rather than a throw: a
 * deployment without media is valid, and `requireConfig` decides per service
 * whether the absence is fatal.
 */
export const resolveS3Config = (): S3Config => ({
  host: env.string('S3_HOST', ''),
  accessKey: env.string('S3_ACCESS', ''),
  secretKey: env.string('S3_SECRET', ''),
  bucket: env.string('S3_BUCKET', 'spotter'),
})
