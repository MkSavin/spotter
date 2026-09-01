import {
  catalogController,
  catalogUpdatedStream,
  CatalogCache,
  deliveryStreams,
  eventStreams,
  HeartbeatRegistry,
  heartbeatStream,
  mediaStreams,
  RedisRegulator,
  timelapseStreams,
} from '@spotter/transport'
import { defaultLogger } from 'stenograph'

import { cameraStagedController } from '../../apps/depot/src/controllers/cameraStagedController'
import { mediaStagedController } from '../../apps/depot/src/controllers/mediaStagedController'
import { commandController } from '../../apps/server/src/transport/controllers/commandController'
import { eventController } from '../../apps/server/src/transport/controllers/eventController'
import { eventMediaController } from '../../apps/server/src/transport/controllers/eventMediaController'
import { createDatabase as createServerDb } from '../../apps/server/src/db/client'
import { temp } from '../../apps/depot/src/fs/temp'
import { forward } from '../../apps/forwarder/src/forward'
import { downStreams, UP_STREAMS } from '../../apps/forwarder/src/streams'
import { fakeS3 } from './externals'
import { connect, runRegulator, type ServiceHandle } from './services'

/**
 * The two shapes Spotter is deployed in.
 *
 * `single` — one Redis, everything on it.
 * `split`  — ingest and cloud on separate Redis instances, bridged by the
 *            forwarder. Streams that are not mirrored simply never arrive,
 *            which is a whole class of bug the single-node shape cannot show.
 */
export type Topology = 'single' | 'split'

export type Deployment = {
  topology: Topology
  /** Where the NVR adapter and depot live. */
  ingestUrl: string
  /** Where server, telegram and pwa live. */
  cloudUrl: string
  s3: ReturnType<typeof fakeS3>
  stop: () => Promise<void>
}

export type DeploymentDeps = {
  ingestUrl: string
  cloudUrl: string
}

/** Server: the domain. Consumes events and commands, publishes deliveries. */
export const runServer = async (
  url: string,
  s3: ReturnType<typeof fakeS3>,
): Promise<ServiceHandle & { db: ReturnType<typeof createServerDb> }> => {
  const { producer, subscriber } = await connect(url)
  const db = createServerDb(':memory:')
  const catalog = new CatalogCache(defaultLogger)

  const context = {
    config: {
      source: 'frigate',
      presignExpiry: 60,
      s3: { bucket: 'test', stagingPrefix: 'staging' },
    },
    logger: defaultLogger,
    db,
    catalog,
    s3,
    producer,
    subscriber,
  }

  const handle = await runRegulator(
    new RedisRegulator<typeof context>()
      .message(eventStreams.event, eventController)
      .message(mediaStreams.mediaProcessed, eventMediaController)
      .message(catalogUpdatedStream, catalogController)
      .message(deliveryStreams.commandRequest, commandController),
    context,
    'e2e-server',
  )

  return {
    db,
    stop: async () => {
      await handle.stop()
      subscriber.close()
      producer.disconnect()
    },
  }
}

/**
 * Forwarder: mirrors streams between the two nodes.
 *
 * Uses the real `UP_STREAMS`/`downStreams` map, so a stream someone forgets to
 * add there fails here exactly as it would in production — silently never
 * arriving, which is the point of testing the split shape at all.
 */
export const runForwarder = async (
  ingestUrl: string,
  cloudUrl: string,
  sources: string[],
): Promise<ServiceHandle> => {
  const local = await connect(ingestUrl)
  const remote = await connect(cloudUrl)

  const up = new RedisRegulator<unknown>()
  for (const stream of UP_STREAMS) {
    up.message(stream, forward(remote.producer, 1000))
  }

  const down = new RedisRegulator<unknown>()
  for (const stream of downStreams(sources)) {
    down.message(stream, forward(local.producer, 1000))
  }

  // Each bridge reads the node it mirrors *from*: up reads ingest, down reads
  // cloud. The regulator takes its connections from the context, so they are
  // wired per direction.
  const upHandle = await runRegulator(
    up,
    { ...local, logger: defaultLogger },
    'e2e-fwd-up',
  )
  const downHandle = await runRegulator(
    down,
    { ...remote, logger: defaultLogger },
    'e2e-fwd-down',
  )

  return {
    stop: async () => {
      await upHandle.stop()
      await downHandle.stop()
      local.subscriber.close()
      local.producer.disconnect()
      remote.subscriber.close()
      remote.producer.disconnect()
    },
  }
}

/** Depot: transcodes staged media. Runs the real controllers. */
export const runDepot = async (
  url: string,
  s3: ReturnType<typeof fakeS3>,
): Promise<ServiceHandle> => {
  const { producer, subscriber } = await connect(url)

  // A real directory and real codec settings: depot writes the staged bytes to
  // disk and transcodes them, so stubbing either would test something else.
  const directory = { temp: await temp('spotter-e2e-depot-') }

  const context = {
    directory,
    config: {
      s3: { bucket: 'test', processedPrefix: 'processed' },
      video: { preset: 'awful' },
      image: { quality: 'awful' },
      directory: { cleanupStrategy: 'file-processed' },
    },
    logger: defaultLogger,
    s3,
    producer,
    subscriber,
  }

  const handle = await runRegulator(
    new RedisRegulator<typeof context>()
      .message(mediaStreams.mediaStaged, mediaStagedController)
      .message(mediaStreams.mediaStagedClip, mediaStagedController)
      .message(mediaStreams.cameraStaged, cameraStagedController),
    context,
    'e2e-depot',
  )

  return {
    stop: async () => {
      await handle.stop()
      subscriber.close()
      producer.disconnect()
      await directory.temp.remove()
    },
  }
}
