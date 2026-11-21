import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const limits = { resident: 3072, topic: 8192 }

const size = async (file: string) =>
  Buffer.byteLength(
    (await Bun.file(path.join(root, file)).text()).replaceAll('\r\n', '\n'),
  )

test('agent documentation stays within its context budget', async () => {
  const topics = await Array.fromAsync(
    new Bun.Glob('.agents/**/*.md').scan(root),
  )
  expect(topics.length).toBeGreaterThan(0)

  const oversized: string[] = []
  if ((await size('AGENTS.md')) > limits.resident) {
    oversized.push(`AGENTS.md: сократи до ${limits.resident} байт`)
  }
  for (const file of topics) {
    if ((await size(file)) > limits.topic) {
      oversized.push(`${file}: раздели по темам до ${limits.topic} байт`)
    }
  }
  expect(oversized).toEqual([])
})

test('agent documentation resolves its relative links', async () => {
  const documents = [
    'AGENTS.md',
    ...(await Array.fromAsync(new Bun.Glob('.agents/**/*.md').scan(root))),
  ]
  const broken: string[] = []
  for (const file of documents) {
    const markdown = await Bun.file(path.join(root, file)).text()
    for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]?.split('#')[0]
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue
      const resolved = path.resolve(root, path.dirname(file), target)
      if (!existsSync(resolved)) broken.push(`${file}: ${target}`)
    }
  }
  expect(broken).toEqual([])
})
