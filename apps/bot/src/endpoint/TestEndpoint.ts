import { NvrEndpoint } from './NvrEndpoint'
import { type ResourceParams, ResourceType } from './Resource'

export const testMedia: Record<ResourceType, string> = {
  [ResourceType.clip]: '{host}/api/events/{id}/clip.mp4',
  [ResourceType.snapshot]: '{host}/images/detection.jpg',
  [ResourceType.latestFrame]: '{host}/images/detection.jpg',
}

export class TestEndpoint extends NvrEndpoint {
  get hostUrl(): string {
    return 'https://test.test/'
  }

  resolveResourceUrl(type: ResourceType, parameters: ResourceParams): string {
    return this.settleUrl(testMedia[type], parameters)
  }
}
