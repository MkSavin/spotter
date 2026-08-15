import { describe, expect, test } from 'bun:test'
import { prefixFormat } from '../format/prefixFormat'
import { Stenograph } from '../Stenograph'
import { StenographTransport } from '../transport/StenographTransport'
import type { StenographLevelRepository, StenographMessage } from '../types'

const levels: StenographLevelRepository = [{ name: 'error', icon: 'ERR' }]

/** Transport that records every message it actually receives. */
class RecordingTransport extends StenographTransport {
  readonly records: string[] = []

  // biome-ignore lint/complexity/noUselessConstructor: widens the protected base constructor to public so the transport can be instantiated here
  constructor() {
    super()
  }

  protected log(_stenograph: Stenograph, message: StenographMessage): void {
    this.records.push(String(message))
  }
}

const build = () => {
  const transport = new RecordingTransport()
  const logger = new Stenograph({
    path: 'root',
    levels,
    transport: [transport],
    format: prefixFormat((message) => `${message.content}`),
  })
  return { logger, transport }
}

describe('Stenograph enabled propagation', () => {
  test('a disabled logger emits nothing', () => {
    const { logger, transport } = build()
    logger.disable()
    logger.error('nope')
    expect(transport.records).toHaveLength(0)
  })

  test('children created after disable() inherit the disabled state', () => {
    const { logger, transport } = build()
    logger.disable()

    const child = logger.sub('child')
    child.error('still silent')

    expect(transport.records).toHaveLength(0)
  })

  test('children of an enabled logger keep logging', () => {
    const { logger, transport } = build()
    logger.sub('child').error('audible')
    expect(transport.records).toHaveLength(1)
  })
})
