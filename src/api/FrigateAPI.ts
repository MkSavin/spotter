import process from 'node:process'
import dayjs from 'dayjs'
import signJWT from 'jwt-encode'
import request from 'request'
import type { Stenograph } from '../stenograph/Stenograph'
import { logger as defaultLogger } from '../stenograph/log'

export class FrigateAPI {
  public static generateJWT(): string {
    return signJWT(
      {
        sub: process.env.FRIGATE_AUTH_USER,
        exp: dayjs().unix() + 60 * 60,
      },
      process.env.FRIGATE_AUTH_SECRET ?? '',
    )
  }

  jwt: string
  logger: Stenograph

  constructor(logger: Stenograph = defaultLogger) {
    this.jwt = FrigateAPI.generateJWT()
    this.logger = logger
  }

  get(url: string): request.Request {
    return request
      .get(url, {
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      })
      .on('error', this.logger.error)
  }

  post(url: string): request.Request {
    return request
      .get(url, {
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      })
      .on('error', this.logger.error)
  }
}
