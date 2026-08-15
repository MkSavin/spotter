#!/usr/bin/env bun

// Rewritten from https://github.com/iamchathu/changeset-conventional-commits,
// ported to Bun.$ (no zx) with path-segment package matching.

import path from 'node:path'
import process from 'node:process'
import readChangesets from '@changesets/read'
import writeChangeset from '@changesets/write'
import { getPackages } from '@manypkg/get-packages'
import { $ } from 'bun'
import { CommitParser } from 'conventional-commits-parser'
import config from '../.changeset/config.json' with { type: 'json' }

const cwd = process.cwd()

// v1 returns `root: { dir }`; v2 renamed it to a plain `rootDir` string.
const workspace = await getPackages(cwd)
const { packages } = workspace
const rootDir =
  (workspace as { rootDir?: string }).rootDir ??
  (workspace as unknown as { root: { dir: string } }).root.dir

const visiblePackages = packages.filter(
  ({ packageJson }) =>
    !!packageJson.version &&
    ('versioning' in packageJson
      ? (packageJson as { versioning?: { disabled?: boolean } }).versioning
          ?.disabled !== true
      : true),
)

console.log(`Found ${visiblePackages.length} visible packages`)

const baseBranch = config.baseBranch ?? 'master'

await $`git fetch origin ${baseBranch}`
const currentBranch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()

console.log(`Using: current branch ${currentBranch}, base branch ${baseBranch}`)

let sinceRef = `origin/${baseBranch}`

if (currentBranch === baseBranch) {
  try {
    sinceRef = (await $`git describe --tags --abbrev=0`.text()).trim()
  } catch {
    sinceRef = (await $`git rev-list --max-parents=0 HEAD`.text()).trim()
  }
}

const commitHashes = (
  await $`git rev-list --ancestry-path ${sinceRef}...HEAD`.text()
)
  .trim()
  .split('\n')
  .reverse()
  .filter(Boolean)

const commits = await Promise.all(
  commitHashes.map(async (hash) => ({
    hash,
    message: (await $`git log -n 1 --pretty=format:%B ${hash}`.text()).trim(),
  })),
)

const parser = new CommitParser({
  breakingHeaderPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!: (.*)$/,
  headerPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!?: (.*)$/,
})

const changeTypeByHead: Record<string, 'patch' | 'minor'> = {
  fix: 'patch',
  feat: 'minor',
}

const conventionalCommits = commits.map((commit) => {
  const meta = parser.parse(commit.message)
  const breaking = meta.notes.some((note) =>
    /breaking change/i.test(note.title),
  )
  return {
    ...commit,
    meta: {
      ...meta,
      breaking,
      changeType: changeTypeByHead[meta.type?.toLowerCase() ?? ''],
    },
  }
})

console.log(`Found ${conventionalCommits.length} commits`)

// Paths whose change is not a release for anyone.
const ignore = [
  /\.env.*$/i,
  /\.build-meta$/i,
  /(?:^|\/)dist\//i,
  /(?:^|\/)\.idea\//i,
  /(?:^|\/)(?:\.integration|\.github|\.deployment)\//i,
  /(?:^|\/)\.changeset\//i,
]

/** True when `file` sits inside `dir`, matched by path segment, not substring. */
const belongs = (file: string, dir: string): boolean =>
  file === dir || file.startsWith(`${dir}/`)

const changesets = await Promise.all(
  conventionalCommits.map(async (commit) => {
    const affectedFiles = (
      await $`git diff-tree --no-commit-id --name-only ${commit.hash} -r`.text()
    )
      .trim()
      .split('\n')
      .filter((file) => file && !ignore.some((rule) => rule.test(file)))

    if (!affectedFiles.length) return undefined

    const affectedPackages = visiblePackages.filter((entry) => {
      const dir = path.relative(rootDir, entry.dir)
      return affectedFiles.some((file) => belongs(file, dir))
    })

    if (!affectedPackages.length) return undefined

    return {
      releases: affectedPackages.map((entry) => ({
        name: entry.packageJson.name,
        type: commit.meta.breaking
          ? ('major' as const)
          : (commit.meta.changeType ?? ('none' as const)),
      })),
      summary: commit.message,
    }
  }),
)

const pending = changesets.filter((entry) => entry !== undefined)

if (!pending.length) {
  console.log('No changesets to create')
  process.exit(0)
}

type Release = { name: string; type: string }
type Changeset = { releases: Release[]; summary: string }

// The CJS interop wraps these in a `default`; unwrap and pin the call shapes.
const read = (
  'default' in readChangesets ? readChangesets.default : readChangesets
) as (cwd: string) => Promise<Changeset[]>
const write = (
  'default' in writeChangeset ? writeChangeset.default : writeChangeset
) as (changeset: Changeset, cwd: string) => Promise<string>

const availableChangesets = await read(cwd)

const signature = (releases: { name: string; type: string }[]) =>
  releases.map((r) => `${r.name}-${r.type}`).join(';')

const newChangesets = pending.filter(
  (entry) =>
    !availableChangesets.some(
      (available) =>
        signature(available.releases) === signature(entry.releases) &&
        available.summary.trim().replaceAll('\n', '') ===
          entry.summary.trim().replaceAll('\n', ''),
    ),
)

const wroteChangesets = await Promise.all(
  newChangesets.map((changeset) =>
    write(changeset, cwd).then((id) => ({ id, ...changeset })),
  ),
)

if (!wroteChangesets.length) {
  console.log('No created changesets')
}

for (const changeset of wroteChangesets) {
  console.log('Created changeset:', changeset.id)
  console.log('  Summary:', changeset.summary)
  console.log('  Releases:')
  for (const entry of changeset.releases) {
    console.log(`    ${entry.name}: ${entry.type}`)
  }
}
