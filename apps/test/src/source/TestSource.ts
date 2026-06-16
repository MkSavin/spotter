import { type EventSink, Source, type SourceHandle } from '@spotter/sink'
import type { TestConfig } from '../config'
import { TestRepl } from './TestRepl'

/**
 * Synthetic source: instead of ingesting from a real NVR transport, it runs an
 * interactive REPL ({@link TestRepl}) so a developer emits canonical events on
 * demand. Combined with TestMediaProvider/TestCatalog this exercises the entire
 * pipeline offline.
 */
export class TestSource extends Source<TestConfig> {
  get code(): string {
    return 'test'
  }

  async run(emit: EventSink): Promise<SourceHandle> {
    const repl = new TestRepl(this.config, emit, this.logger.sub('repl'))
    repl.start()

    return {
      stop: async () => {
        await repl.stop()
      },
    }
  }
}
