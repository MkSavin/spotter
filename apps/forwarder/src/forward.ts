import type {
  StreamMessageController,
  StreamProducer,
} from '@spotter/transport'

/**
 * Builds a passthrough handler that mirrors an entry onto the same-named stream
 * on the other Redis. The raw `value` is forwarded verbatim (no re-encoding), so
 * the canonical payload is preserved byte-for-byte.
 *
 * The owning {@link RedisRegulator} XACKs the source entry only after this
 * resolves, giving at-least-once store-and-forward: on a WAN outage entries pile
 * up in the source group (durable AOF) and drain once the link recovers.
 */
export const forward =
  <Context>(
    target: StreamProducer,
    maxLen: number,
  ): StreamMessageController<Context> =>
  async ({ topic, message }) => {
    await target.send('XADD', [
      topic,
      'MAXLEN',
      '~',
      String(maxLen),
      '*',
      'value',
      message.value,
    ])
  }
