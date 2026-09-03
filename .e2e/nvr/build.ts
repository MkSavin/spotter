#!/usr/bin/env bun
import { $ } from 'bun'

/**
 * Builds the app images the rig runs, into the local daemon.
 *
 * The release pipeline pushes manifests to ghcr and leaves nothing runnable
 * here, so the rig builds the same Dockerfiles with `--load`.
 */
const APPS = ['frigate', 'server', 'telegram', 'pwa'] as const

const root = new URL('../../', import.meta.url).pathname

for (const app of APPS) {
  console.log(`building ${app}…`)

  const result =
    await $`docker build --file ${root}apps/${app}/Dockerfile --build-arg APP_RELATIVE_PATH=apps/${app} --build-arg APP_PACKAGE_NAME=@spotter/${app} --tag spotter-nvr/${app}:test --load ${root}`.nothrow()

  if (result.exitCode !== 0) {
    console.error(`\n${app} failed to build`)
    process.exit(1)
  }
}

console.log('images ready')
