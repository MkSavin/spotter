import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'
import { FrigateSource } from './FrigateSource'
import type { Source } from './Source'

type SourceRegistry = Record<string, new (...args: never[]) => Source>

const sources = {
  frigate: FrigateSource,
} satisfies SourceRegistry

export type SourceCode = keyof typeof sources

/**
 * Picks the ingestion adapter for the configured NVR. One sink instance runs
 * one source; deploy a sink per NVR. Unknown codes fall back to Frigate.
 */
export const constructSource = (
  type: SourceCode,
  config: CoreConfig,
  logger: Stenograph,
): Source => {
  const source = sources[type] ?? sources.frigate
  return new source(config, logger)
}
