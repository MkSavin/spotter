#!/usr/bin/env zx

import path from 'node:path'

const versions = JSON.parse(argv.versions || '[]')
const dry = argv['dry-run'] === 'true' ?? false
const noPublish = argv['no-publish'] === 'true' ?? false

const entries = (
  await Promise.all(
    versions.map(async (version) => {
      // Warn: Running unsafe command due to bad arguments parsing
      const q = $.quote
      $.quote = (v) => v
      const out =
        await $`find ./apps -name 'package.json' -exec grep -l '"name":\\s*"\\(${version.name}\\)"' {} \\;`
      $.quote = q

      const packagePath = out.stdout.trim()

      if (!packagePath) {
        return
      }

      return {
        path: path.dirname(packagePath),
        name: version.name,
        code: version.name
          .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
          .replaceAll(/[\s\/_]+/g, '-')
          .replaceAll(/[@$#]+/g, '')
          .toLowerCase(),
        version: version.version,
      }
    }),
  )
).filter(Boolean)

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
      APP_RELATIVE_PATH: entry.path, // .replaceAll(/^.\//g)
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

    if (dry) {
      return
    }

    // Warn: Running unsafe command due to bad arguments parsing
    const q = $.quote
    $.quote = (v) => v
    await $`${buildCommand}`

    if (!noPublish) {
      await $`${pushCommand}`
    }
    $.quote = q
  }),
)

console.log('Images successfully built...')
