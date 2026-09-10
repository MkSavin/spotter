import type {
  StreamMessageController,
  StreamProducer,
} from '@spotter/transport'

/**
 * Forwarded byte-for-byte, and acked only once mirrored: on a WAN outage
 * entries pile up in the source group and drain when the link returns.
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
