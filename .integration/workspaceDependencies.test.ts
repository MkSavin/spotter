import { expect, test } from 'bun:test'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')

/**
 * Statement-anchored, so a word like `from` inside a string is not taken for
 * an import. Covers `import … from`, `export … from`, side-effect imports and
 * dynamic `import()`.
 */
const SPECIFIERS = [
  /^(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/gm,
  /^import\s+['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
]

const isBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') ||
  specifier === 'bun' ||
  specifier.startsWith('bun:')

/** `@scope/name/deep/path` and `name/deep` both resolve to their package. */
const packageOf = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')

/**
 * Every image installs with `bun install --filter <app>`, which links only what
 * the app declares. Locally and in CI every workspace is installed, so an
 * undeclared import resolves there and fails only in the image build.
 */
test('every workspace declares the packages its source imports', async () => {
  const undeclared: string[] = []

  for await (const manifest of new Bun.Glob(
    '{apps,packages}/*/package.json',
  ).scan(root)) {
    const directory = path.join(root, path.dirname(manifest))
    const pkg = await Bun.file(path.join(root, manifest)).json()
    const declared = new Set<string>([
      pkg.name,
      ...Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      }),
    ])

    for await (const file of new Bun.Glob('src/**/*.{ts,tsx}').scan(
      directory,
    )) {
      // Tests never reach a bundle, and run with every workspace installed.
      if (/\.test\.tsx?$/.test(file)) continue

      const source = await Bun.file(path.join(directory, file)).text()

      for (const pattern of SPECIFIERS) {
        for (const [, specifier] of source.matchAll(pattern)) {
          if (!specifier || specifier.startsWith('.') || isBuiltin(specifier)) {
            continue
          }
          if (!declared.has(packageOf(specifier))) {
            undeclared.push(
              `${path.relative(root, path.join(directory, file))}: ${specifier}`,
            )
          }
        }
      }
    }
  }

  expect(undeclared).toEqual([])
})
