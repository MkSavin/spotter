import { runSink } from '@spotter/sink'
import information from '../package.json'
import { TestCatalog } from './catalog/TestCatalog'
import { resolveConfig } from './config'
import { applicationLogger } from './log'
import { TestMediaProvider } from './media/TestMediaProvider'
import { TestSource } from './source/TestSource'

const config = resolveConfig()

// Synthetic ingestion: a REPL emits canonical SpotterEvents on demand. Media is
// served from committed local fixtures and the catalog is built from config —
// no NVR, MQTT broker or network required.
const source = new TestSource(config, applicationLogger)
const mediaProvider = new TestMediaProvider(config.fixtures, applicationLogger)
const catalog = new TestCatalog(config)

runSink({
  config,
  logger: applicationLogger,
  information,
  sourceId: config.sourceId,
  source,
  mediaProvider,
  catalog,
}).catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
