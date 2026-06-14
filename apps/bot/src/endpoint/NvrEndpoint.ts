import type { Config } from '../config'
import type { ResourceParams, ResourceType } from './Resource'

export abstract class NvrEndpoint {
  constructor(protected readonly config: Config) {}

  abstract get hostUrl(): string

  abstract resolveResourceUrl(
    type: ResourceType,
    parameters: ResourceParams,
  ): string

  get normalizedHostUrl(): string {
    return this.hostUrl.replaceAll(
      /^\s*((?:http|ftp)s?:\/\/[\w.\/]*?)\/?(?:\?.*)?\s*$/gi,
      '$1',
    )
  }

  settleUrl(url: string, parameters: ResourceParams = {}): string {
    let result = url.replaceAll('{host}', this.normalizedHostUrl)

    Object.entries(parameters).forEach(([key, value]) => {
      result = result.replaceAll(`{${key}}`, value)
    })

    return result
  }

  composeHeaders(
    type: ResourceType,
    parameters: ResourceParams,
  ): Bun.HeadersInit | undefined {
    return undefined
  }

  composeResourceRequest(
    type: ResourceType,
    parameters: ResourceParams,
  ): Request {
    return new Request(this.resolveResourceUrl(type, parameters), {
      headers: this.composeHeaders(type, parameters),
    })
  }

  fetchRequest(request: Request): Promise<Response> {
    return fetch(request, {
      method: 'GET',
    })
  }

  fetchResource(
    type: ResourceType,
    parameters: ResourceParams,
  ): Promise<Response> {
    return this.fetchRequest(this.composeResourceRequest(type, parameters))
  }

  resolveEventCode(id: string): string {
    return id
  }
}
