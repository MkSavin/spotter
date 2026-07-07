import { runSink } from '@spotter/sink'
import { eventStreams } from '@spotter/transport'
import information from '../package.json'
import { FrigateCatalog } from './catalog/FrigateCatalog'
import { resolveConfig } from './config'
import { applicationLogger } from './log'
import { FrigateMediaProvider } from './media/FrigateMediaProvider'
import { constructSource } from './source/constructSource'
import { eventTestController } from './stream/controllers/eventTestController'

const config = resolveConfig()

// Pluggable NVR ingestion: one source per sink instance. The source emits
// canonical SpotterEvents; the runtime stamps `source` and publishes them.
const source = constructSource(config.source.type, config, applicationLogger)

// Frigate-specific media access (URL scheme + JWT) and taxonomy. Credentials
// live only here; only staged S3 keys travel downstream.
const mediaProvider = new FrigateMediaProvider(config.frigate)
const catalog = new FrigateCatalog(config, applicationLogger)

runSink({
  config,
  logger: applicationLogger,
  information,
  sourceId: config.sourceId,
  source,
  mediaProvider,
  catalog,
  controllers: [
    { stream: eventStreams.testSeed, controller: eventTestController },
  ],
}).catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
