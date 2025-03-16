#!/usr/bin/env zx

// Disclaimer: Rewritten version of https://github.com/iamchathu/changeset-conventional-commits

import readChangesets from '@changesets/read'
import writeChangeset from '@changesets/write'
import manypackages from '@manypkg/get-packages'
import { CommitParser } from 'conventional-commits-parser'
import { $ } from 'zx/core'
import config from '../.changeset/config.json' with { type: 'json' }

const cwd = process.cwd()

const response = await manypackages.getPackages(cwd)

const visiblePackages = response.packages.filter(
  ({ packageJson }) =>
    !!packageJson.version &&
    ('versioning' in packageJson
      ? packageJson.versioning?.disabled !== true
      : true),
)

console.log(`Found ${visiblePackages.length} visible packages`)

const baseBranch = config.baseBranch ?? 'master'

await $`git fetch origin ${baseBranch}`
const currentBranch = (await $`git rev-parse --abbrev-ref HEAD`).stdout.trim()

console.log(`Using: current branch ${currentBranch}, base branch ${baseBranch}`)

let sinceRef = `origin/${baseBranch}`

if (currentBranch === baseBranch) {
  try {
    sinceRef = (await $`git describe --tags --abbrev=0`).stdout.trim()
  } catch {
    sinceRef = (await $`git rev-list --max-parents=0 HEAD`).stdout.trim()
  }
}

const commitHashes = (
  await $`git rev-list --ancestry-path ${sinceRef}...HEAD`
).stdout
  .trim()
  .split('\n')
  .reverse()

const commits = await Promise.all(
  commitHashes.map(async (hash) => ({
    hash,
    message: (await $`git log -n 1 --pretty=format:%B ${hash}`).stdout.trim(),
  })),
)

const parser = new CommitParser({
  breakingHeaderPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!: (.*)$/,
  headerPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!?: (.*)$/,
})

const commitTypes = [
  {
    changeType: 'patch',
    headTypes: ['fix'],
  },
  {
    changeType: 'minor',
    headTypes: ['feat'],
  },
]

const conventionalCommits = commits.map((commit) => {
  const meta = parser.parse(commit.message)

  const breaking = meta.notes.some((note) =>
    note.title.match(/breaking change/gi),
  )

  const changeType = commitTypes.find(({ changeType, headTypes }) =>
    headTypes.includes(meta.type?.toLowerCase()),
  )

  return {
    ...commit,
    meta: {
      ...meta,
      breaking,
      changeType: changeType?.changeType,
    },
  }
})

console.log(`Found ${conventionalCommits.length} commits`)

const ignore = [
  {
    name: 'Environment',
    regular: /\.env.*$/gi,
  },
  {
    name: 'Build meta',
    regular: /\.build-meta$/gi,
  },
  {
    name: 'Build files',
    regular: /dist\//gi,
  },
  {
    name: 'Turbo cache',
    regular: /.turbo\//gi,
  },
  {
    name: 'Idea project files',
    regular: /.idea\//gi,
  },
  {
    name: 'CI/CD files',
    regular: /(?:\.integration|\.github|\.deployment)\//gi,
  },
  {
    name: 'Versioning files',
    regular: /\.changeset\//gi,
  },
]

const changesets = await Promise.all(
  conventionalCommits.map(async (commit) => {
    const affectedFiles = (
      await $`git diff-tree --no-commit-id --name-only ${commit.hash} -r`
    ).stdout
      .trim()
      .split('\n')
      .filter(
        (file) =>
          !ignore.some((ignoreRules) =>
            file.toString().match(ignoreRules.regular),
          ),
      )

    if (!affectedFiles.length) {
      return
    }

    const affectedPackages = visiblePackages.filter((entry) =>
      affectedFiles.some((file) => file.match(entry.relativeDir)),
    )

    if (!affectedPackages.length) {
      return
    }

    return {
      releases: affectedPackages.map((entry) => ({
        name: entry.packageJson.name,
        type: commit.meta.breaking
          ? 'major'
          : (commit.meta.changeType ?? 'none'),

        package: entry,
        commit,
      })),
      summary: commit.message,
    }
  }),
)

if (changesets.length) {
  const read =
    'default' in readChangesets ? readChangesets.default : readChangesets

  const availableChangesets = await read(cwd)

  const newChangesets = changesets.filter(Boolean).filter(
    (entry) =>
      !availableChangesets.some((available) => {
        const availableReleases = available.releases
          .map((release) => `${release.name}-${release.type}`)
          .join(';')
        const newReleases = entry.releases
          .map((release) => `${release.name}-${release.type}`)
          .join(';')

        const availableSummary = available.summary.trim().replaceAll('\n', '')
        const newSummary = entry.summary.trim().replaceAll('\n', '')

        return (
          availableReleases === newReleases && availableSummary === newSummary
        )
      }),
  )

  // Loader bug fix
  const write =
    'default' in writeChangeset ? writeChangeset.default : writeChangeset

  const wroteChangesets = await Promise.all(
    newChangesets.map((changeset) =>
      write(changeset, cwd).then((id) => ({
        id,
        ...changeset,
      })),
    ),
  )

  if (!wroteChangesets.length) {
    console.log('No created changesets')
  }

  wroteChangesets.forEach((changeset) => {
    console.log('Created changeset:', changeset.id)
    console.log('  Summary:', changeset.summary)
    console.log('  Releases:')
    changeset.releases.forEach((entry) => {
      console.log(`    ${entry.name}: ${entry.type}`)
    })
  })
}
