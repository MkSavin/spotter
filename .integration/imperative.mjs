#!/usr/bin/env zx

import path from 'node:path'

const file = argv.file ?? '.build-meta'
const filter = argv.filter ?? undefined

const searchOutput = (
  await $`find ./apps -type f -name "${file}" -print0 | xargs -0 -I{} sh -c 'echo "{} = $(cat "{}")"'`
).stdout

const lineMatches = searchOutput.matchAll(
  /^(.*) = ([\w\/@]*)@([\d.]+(?:-.+)?)$/gim,
)

const entries = [...lineMatches]
  .map((match) => {
    const parts = match.splice(1)

    return {
      path: path.dirname(parts[0]),
      name: parts[1],
      code: parts[1]
        .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
        .replaceAll(/[\s\/_]+/g, '-')
        .replaceAll(/[@$#]+/g, '')
        .toLowerCase(),
      version: parts[2],
    }
  })
  .filter((entry) => (!filter ? true : entry.code === filter))

if (entries.length === 0) {
  process.exit(0)
}

console.log(`Got ${entries.length} projects to build. Building...`)

const environment = {
  NPM_TOKEN: process.env.GITHUB_TOKEN,
}

await Promise.all(
  entries.map(async (entry) => {
    const containerName = `ghcr.io/mksavin/${entry.code}`

    const buildEnvironment = {
      ...environment,
      APP_RELATIVE_PATH: entry.path,
    }

    const buildArgs = Object.entries(buildEnvironment)
      .filter((_, value) => Boolean(value))
      .map(([key, value]) => `--build-arg "${key}=${value}"`)
      .join(' ')

    const tags = [
      `${containerName}:latest`,
      `${containerName}:${entry.version}-alpine`,
    ]

    const tagArgs = tags.map((tag) => `-t "${tag}"`).join(' ')

    const buildCommand =
      `docker build . ${buildArgs} -f "${entry.path}/Dockerfile" ${tagArgs}`.replaceAll(
        /&&;/g,
        '',
      )
    const pushCommand = `docker push ${containerName} --all-tags`.replaceAll(
      /&&;/g,
      '',
    )

    console.log(
      `[~] Building ${entry.name}@v${entry.version} (${entry.path}) to ${containerName}...`,
    )
    console.debug('    Using build arguments:', buildArgs)
    console.debug('    Using build tags:', tagArgs)
    console.debug('    Using build command:', buildCommand)
    console.debug('    Using push command:', pushCommand)
    console.log()

    // Warn: Running unsafe command
    const q = $.quote
    $.quote = (v) => v
    await $`${buildCommand}`
    await $`${pushCommand}`
    $.quote = q
  }),
)

console.log('Images successfully built...')
