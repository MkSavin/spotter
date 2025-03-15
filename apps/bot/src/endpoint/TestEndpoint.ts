import { Endpoint } from './Endpoint'
import { type ResourceParams, ResourceType } from './Resource'

export const testMedia: Record<ResourceType, string> = {
  [ResourceType.clip]: '{host}/api/events/{id}/clip.mp4',
  [ResourceType.snapshot]: '{host}/images/detection.jpg',
  [ResourceType.latestFrame]: '{host}/images/detection.jpg',
}

export class TestEndpoint extends Endpoint {
  get hostUrl(): string {
    return 'https://frigate.video/'
  }

  resolveResource(type: ResourceType, parameters: ResourceParams): string {
    return this.resolveUrl(testMedia[type], parameters)
  }
}
