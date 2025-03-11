import type { ResourceParams, ResourceType } from './Resource'

export abstract class Endpoint {
  abstract resolveResource(
    type: ResourceType,
    parameters: ResourceParams,
  ): string

  abstract get hostUrl(): string

  get normalizedHostUrl(): string {
    return this.hostUrl.replaceAll(
      /^\s*((?:http|ftp)s?:\/\/[\w.\/]*?)\/?(?:\?.*)?\s*$/gi,
      '$1',
    )
  }

  resolveUrl(url: string, parameters: ResourceParams = {}): string {
    let result = url.replaceAll('{host}', this.normalizedHostUrl)

    Object.entries(parameters).forEach(([key, value]) => {
      result = result.replaceAll(`{${key}}`, value)
    })

    return result
  }
}
