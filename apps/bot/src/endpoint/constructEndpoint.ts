import type { Config } from '../config'
import { FrigateEndpoint } from './FrigateEndpoint'
import type { NvrEndpoint } from './NvrEndpoint'
import { TestEndpoint } from './TestEndpoint'

type EndpointRegistry = Record<string, typeof NvrEndpoint>

const endpoints = {
  frigate: FrigateEndpoint,
  test: TestEndpoint,
} satisfies EndpointRegistry

export type EndpointCode = keyof typeof endpoints

export const constructEndpoint = <TypeCode extends EndpointCode>(
  type: TypeCode,
  config: Config,
): NvrEndpoint => {
  const endpoint = endpoints[type] ?? endpoints.frigate
  return new endpoint(config)
}
