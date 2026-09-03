import { runSink } from '@spotter/sink'
import { probeStreams } from '@spotter/transport'
import information from '../package.json'
import { FrigateCatalog } from './catalog/FrigateCatalog'
import { resolveConfig } from './config'
import { watchCameraHealth } from './frigate/watchCameraHealth'
import { applicationLogger } from './log'
import { FrigateMediaProvider } from './media/FrigateMediaProvider'
import { FrigateNotificationSuspender } from './notifications/FrigateNotificationSuspender'
import { probeDetails } from './probeDetails'
import { constructSource } from './source/constructSource'
import { probeController } from './stream/controllers/probeController'
import { FrigateTimelapseProvider } from './timelapse/FrigateTimelapseProvider'

const config = resolveConfig()

// Pluggable NVR ingestion: one source per sink instance. The source emits
// canonical SpotterEvents; the runtime stamps `source` and publishes them.
const source = constructSource(config.source.type, config, applicationLogger)

// Frigate-specific media access (URL scheme + JWT) and taxonomy. Credentials
// live only here; only staged S3 keys travel downstream.
const mediaProvider = new FrigateMediaProvider(config.frigate)
const catalog = new FrigateCatalog(config, applicationLogger)
const timelapseProvider = new FrigateTimelapseProvider(config.frigate)
const notificationSuspender = new FrigateNotificationSuspender(
  config,
  applicationLogger,
)

// Polled in the background: the NVR knows a stream dropped within seconds,
// while silence on our side takes hours to become suspicious.
const cameraHealth = watchCameraHealth(config, applicationLogger.sub('nvr'))

runSink({
  config,
  logger: applicationLogger,
  information,
  sourceId: config.sourceId,
  source,
  mediaProvider,
  catalog,
  timelapseProvider,
  notificationSuspender,
  timelapseStatePath: config.timelapseStatePath,
  timelapseDeadlineMs: config.timelapseDeadlineMs,
  controllers: [
    {
      stream: probeStreams.request(config.sourceId),
      controller: probeController,
    },
  ],
  // Configured, not confirmed: asking the probe on every beat would put a
  // network call on the heartbeat path. A configured probe is the thing worth
  // shouting about — it means someone deployed the profile.
  probeActive: () => Boolean(config.probeEndpoint),
  heartbeatDetails: () => probeDetails(config),
  cameraHealth: cameraHealth.current,
}).catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
