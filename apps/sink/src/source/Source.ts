import type { SpotterEvent } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../config'

/**
 * Called by a source for every canonical event it ingests. The sink runtime
 * wires this to publishEvent — the source itself never touches Redis.
 */
export type EventSink = (event: SpotterEvent) => Promise<void>

export type SourceHandle = {
  stop: () => Promise<void>
}

/**
 * A Source is the pluggable NVR-ingestion adapter. It owns its input transport
 * (MQTT for Frigate, could be HTTP/webhook/poll for others) and the mapping of
 * raw payloads to the canonical `SpotterEvent` contract. Mirror of the bot's
 * `NvrEndpoint`: one concrete subclass per NVR, chosen via `constructSource`.
 * Keep it dumb and stateless — no DB, no Redis, just ingest → parse → emit.
 */
export abstract class Source {
  constructor(
    protected readonly config: CoreConfig,
    protected readonly logger: Stenograph,
  ) {}

  abstract get code(): string

  /**
   * Starts ingesting and calls `emit` for each parsed canonical event.
   *
   * @returns a handle to tear the transport down on shutdown.
   */
  abstract run(emit: EventSink): Promise<SourceHandle>
}
