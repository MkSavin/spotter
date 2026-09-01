#!/usr/bin/env bun
import { $ } from 'bun'

/**
 * Builds the app images into the local daemon.
 *
 * The release pipeline pushes multi-arch manifests straight to ghcr and its
 * `--no-publish` mode writes only to the cache, so neither leaves anything
 * runnable here. This builds the same Dockerfiles with `--load` instead.
 */
const APPS = ['frigate', 'depot', 'server', 'forwarder'] as const

const root = new URL('../../', import.meta.url).pathname

for (const app of APPS) {
  console.log(`building ${app}…`)

  const result =
    await $`docker build --file ${root}apps/${app}/Dockerfile --build-arg APP_RELATIVE_PATH=apps/${app} --build-arg APP_PACKAGE_NAME=@spotter/${app} --tag spotter-smoke/${app}:test --load ${root}`
      .nothrow()

  if (result.exitCode !== 0) {
    console.error(`\n${app} failed to build`)
    process.exit(1)
  }
}

console.log('images ready')
