#!/usr/bin/env bun

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { $, Glob } from 'bun'

// Runs a command only when its output is older than its sources.
//
//   bun .integration/rerun.ts --out=<file> --src=<glob> [--src=...] -- <cmd...>
//   --force   run regardless of timestamps
//
// Paths are relative to the repository root. Worth it only for commands that
// cost more to start than to skip — vite takes ~1s to boot, `bun build` 0.04s.

const root = path.join(import.meta.dir, '..')
const argv = process.argv.slice(2)

const separator = argv.indexOf('--')
if (separator === -1) {
  console.error('rerun: missing `--` before the command')
  process.exit(2)
}

const flags = argv.slice(0, separator)
const command = argv.slice(separator + 1)

if (command.length === 0) {
  console.error('rerun: no command given after `--`')
  process.exit(2)
}

const valuesOf = (name: string): string[] =>
  flags
    .filter((flag) => flag.startsWith(`--${name}=`))
    .map((flag) => flag.slice(name.length + 3))

const [out] = valuesOf('out')
const sources = valuesOf('src')
const force = flags.includes('--force')

if (!out || sources.length === 0) {
  console.error('rerun: --out and at least one --src are required')
  process.exit(2)
}

const newestSource = (): number => {
  let newest = 0
  for (const pattern of sources) {
    for (const file of new Glob(pattern).scanSync(root)) {
      const { mtimeMs } = statSync(path.join(root, file))
      if (mtimeMs > newest) newest = mtimeMs
    }
  }
  return newest
}

const outPath = path.join(root, out)
if (
  !force &&
  existsSync(outPath) &&
  statSync(outPath).mtimeMs >= newestSource()
) {
  process.exit(0)
}

const [bin, ...rest] = command
await $`${bin} ${rest}`.cwd(root)
