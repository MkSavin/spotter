import * as process from 'node:process'
import { Endpoint } from './Endpoint'
import { type ResourceParams, ResourceType } from './Resource'

export const frigateMedia: Record<ResourceType, string> = {
  [ResourceType.clip]: '{host}/api/events/{id}/clip.mp4',
  [ResourceType.snapshot]: '{host}/api/events/{id}/snapshot.jpg',
  [ResourceType.latestFrame]: '{host}/api/{camera}/latest.jpg',
}

export class FrigateEndpoint extends Endpoint {
  get hostUrl(): string {
    return process.env.FRIGATE_LOCAL_URL ?? ''
  }

  resolveResource(type: ResourceType, parameters: ResourceParams): string {
    return this.resolveUrl(frigateMedia[type], parameters)
  }
}
