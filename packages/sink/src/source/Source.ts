import type { SpotterEvent } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { SinkConfig } from '../config/sinkConfig'

/**
 * Called by a source for every canonical event it ingests. The sink runtime
 * wires this to publishEvent — the source itself never touches Redis.
 */
export type EventSink = (event: SpotterEvent) => Promise<void>

export type SourceHandle = {
  stop: () => Promise<void>
  /**
   * When the NVR last said anything on the transport, event or not.
   *
   * Optional because not every transport has housekeeping traffic to hear. For
   * those that do, this is the only signal that separates a quiet scene from a
   * dead link — events alone cannot, and in September 2026 that gap cost two
   * days of silence nobody noticed.
   */
  lastContactAt?: () => number | undefined
}

/**
 * A Source is the pluggable NVR-ingestion adapter. It owns its input transport
 * (MQTT for Frigate, could be HTTP/webhook/poll for others) and the mapping of
 * raw payloads to the canonical `SpotterEvent` contract: one concrete subclass
 * per NVR. Keep it dumb and stateless — no DB, no Redis, just ingest → parse →
 * emit. The adapter app supplies its own config shape via `TConfig`.
 */
export abstract class Source<TConfig extends SinkConfig = SinkConfig> {
  constructor(
    protected readonly config: TConfig,
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
