import jwt from 'jsonwebtoken'
import type { Config, FrigateConfig } from '../config'
import { NvrEndpoint } from './NvrEndpoint'
import { type ResourceParams, ResourceType } from './Resource'

export const frigateMedia: Record<ResourceType, string> = {
  [ResourceType.clip]: '{host}/api/events/{id}/clip.mp4',
  [ResourceType.snapshot]: '{host}/api/events/{id}/snapshot.jpg',
  [ResourceType.latestFrame]: '{host}/api/{camera}/latest.jpg',
}

export class FrigateEndpoint extends NvrEndpoint {
  frigateConfig: FrigateConfig

  constructor(config: Config) {
    super(config)
    this.frigateConfig = this.config.nvr.frigate
  }

  private generateFrigateJWT(): string {
    return jwt.sign(
      {
        sub: this.frigateConfig.authUser,
        exp: Date.now() / 1000 + 60 * 60 * 3,
      },
      this.frigateConfig.authSecret || '',
      { algorithm: 'HS256' },
    )
  }

  get hostUrl(): string {
    return this.frigateConfig.remoteUrl || ''
  }

  resolveResourceUrl(type: ResourceType, parameters: ResourceParams): string {
    return this.settleUrl(frigateMedia[type], parameters)
  }

  composeHeaders(): Bun.HeadersInit | undefined {
    return {
      Authorization: `Bearer ${this.generateFrigateJWT()}`,
    }
  }

  resolveEventCode(id: string): string {
    return id.split('-').at(1) ?? id
  }
}
