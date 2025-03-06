import process from 'node:process'
import dayjs from 'dayjs'
import signJWT from 'jwt-encode'

export const frigateMedia = {
  event: {
    snapshot: '{host}/api/events/{id}/snapshot.jpg',
    clip: '{host}/api/events/{id}/clip.mp4',
  },
  camera: {
    latest: '{host}/api/{camera}/latest.jpg',
  },
}

const host = process.env.FRIGATE_REMOTE_URL?.trim() ?? ''

export class Frigate {
  public static generateJWT(): string {
    return signJWT(
      {
        sub: process.env.FRIGATE_AUTH_USER,
        exp: dayjs().unix() + 60 * 60,
      },
      process.env.FRIGATE_AUTH_SECRET ?? '',
    )
  }

  resolveUrl(url: string, parameters: Record<string, string> = {}): string {
    let result = url.replaceAll('{host}', host)

    Object.entries(parameters).forEach(([key, value]) => {
      result = result.replaceAll(`{${key}}`, value)
    })

    return result
  }

  get(url: string, parameters: Record<string, string> = {}): Promise<Response> {
    return fetch(this.resolveUrl(url, parameters), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${Frigate.generateJWT()}`,
      },
    })
  }

  post(
    url: string,
    parameters: Record<string, string> = {},
  ): Promise<Response> {
    return fetch(this.resolveUrl(url, parameters), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${Frigate.generateJWT()}`,
      },
    })
  }
}
