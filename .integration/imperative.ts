#!/usr/bin/env bun

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { getPackages } from '@manypkg/get-packages'
import { $ } from 'bun'

// Build and push Docker images for changed `apps/*` packages.
//
//   --versions='[{"name":"@spotter/email","version":"1.2.3"}]'  what was released
//   --from-workspace  take versions from package.json instead of --versions
//   --matrix        print the build matrix as JSON instead of building
//   --only=<name>   build just this package (one matrix job = one image)
//   --platform=...  target platforms (default: amd64 + arm64)
//   --dry-run       resolve and log, run no docker
//   --no-publish    build without pushing
//
// Multi-platform needs a docker-container builder:
//   docker buildx create --name spotter-multi --driver docker-container --use

const OWNER = 'mksavin'
const APPS_PREFIX = `apps${path.sep}`

type PublishedPackage = { name: string; version: string }

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? 'true'] as const
  }),
)

const versions: PublishedPackage[] = JSON.parse(args.get('versions') ?? '[]')
const dryRun = args.get('dry-run') === 'true'
const noPublish = args.get('no-publish') === 'true'
const asMatrix = args.get('matrix') === 'true'
const fromWorkspace = args.get('from-workspace') === 'true'
const only = args.get('only')

// A single-arch image dies with `exec format error` on the other side.
const platform = args.get('platform') ?? 'linux/amd64,linux/arm64'

/** ghcr-safe image name: `@spotter/email` → `spotter-email`. */
const toCode = (name: string): string =>
  name
    .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
    .replaceAll(/[\s/_]+/g, '-')
    .replaceAll(/[@$#]+/g, '')
    .toLowerCase()

// manypkg v1 returned `root: { dir }`; v2+ renamed it to a plain `rootDir`.
const workspace = await getPackages(process.cwd())
const { packages } = workspace
const rootDir =
  (workspace as { rootDir?: string }).rootDir ??
  (workspace as unknown as { root: { dir: string } }).root.dir

const byName = new Map(packages.map((pkg) => [pkg.packageJson.name, pkg]))

// At publish time changesets already bumped package.json.
const released: PublishedPackage[] = fromWorkspace
  ? packages.map((pkg) => ({
      name: pkg.packageJson.name,
      version: pkg.packageJson.version ?? '0.0.0',
    }))
  : versions

type MatrixEntry = {
  name: string
  version: string
  relativePath: string
  code: string
  /** Builds from its own directory, without the Bun build args. */
  standalone?: boolean
}

const entries: MatrixEntry[] = released.flatMap((version) => {
  const pkg = byName.get(version.name)
  if (!pkg) return []

  const relativePath = path.relative(rootDir, pkg.dir)
  // A Dockerfile is what makes a package shippable — `apps/test` has none.
  if (!relativePath.startsWith(APPS_PREFIX)) return []
  if (!existsSync(path.join(pkg.dir, 'Dockerfile'))) return []

  return [
    {
      name: version.name,
      version: version.version,
      relativePath,
      code: toCode(version.name),
    },
  ]
})

/**
 * `spotter-probe` is Rust, so it is not a workspace package and has no version
 * in `package.json` — changesets never sees it. It still ships as an image, so
 * it is added by hand, with its version read from `Cargo.toml`.
 *
 * Its Dockerfile also builds from its own directory rather than the repo root,
 * which is why it carries `standalone`.
 */
const probeEntry = (): MatrixEntry[] => {
  const dir = path.join(rootDir, 'apps', 'probe')
  const manifest = path.join(dir, 'Cargo.toml')
  if (!existsSync(manifest)) return []

  const version = readFileSync(manifest, 'utf8')
    .match(/^version\s*=\s*"([^"]+)"/m)
    ?.at(1)

  if (!version) return []

  return [
    {
      name: 'spotter-probe',
      version,
      relativePath: path.join('apps', 'probe'),
      code: 'spotter-probe',
      standalone: true,
    },
  ]
}

entries.push(...probeEntry())

// CI asks for the matrix first, then runs one job per entry.
if (asMatrix) {
  console.log(JSON.stringify({ include: entries }))
  process.exit(0)
}

const selected = only ? entries.filter((entry) => entry.name === only) : entries

if (selected.length === 0) {
  console.log('No publishable application images. Nothing to build.')
  process.exit(0)
}

console.log(`Got ${selected.length} application(s) to build.`)

for (const entry of selected) {
  const image = `ghcr.io/${OWNER}/${entry.code}`
  const tags = [`${image}:latest`, `${image}:${entry.version}-alpine`]

  console.log(
    `[~] Building ${entry.name}@v${entry.version} (${entry.relativePath}) → ${image}`,
  )

  if (dryRun) continue

  const tagArgs = tags.flatMap((tag) => ['-t', tag])

  // A local tag holds one arch only, so the manifest goes straight to ghcr.
  const outputArgs = noPublish ? ['--output=type=cacheonly'] : ['--push']

  if (entry.standalone) {
    // Its own directory is the context, and it takes none of the Bun args.
    const context = path.join(rootDir, entry.relativePath)
    await $`docker buildx build --platform ${platform} ${context} ${tagArgs} ${outputArgs}`
    continue
  }

  await $`docker buildx build --platform ${platform} -f ${entry.relativePath}/Dockerfile ${rootDir} --build-arg APP_RELATIVE_PATH=${entry.relativePath} --build-arg APP_PACKAGE_NAME=${entry.name} ${tagArgs} ${outputArgs}`
}

console.log('Images successfully built.')
