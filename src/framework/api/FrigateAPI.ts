import process from 'node:process'
import dayjs from 'dayjs'
import signJWT from 'jwt-encode'

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

  constructor() {
    this.jwt = FrigateAPI.generateJWT()
  }

  get(url: string): Promise<Response> {
    return fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
    })
  }

  post(url: string): Promise<Response> {
    return fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
    })
  }
}
