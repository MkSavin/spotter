import { describe, expect, test } from 'bun:test'
import { requestPathname } from './static'

describe('requestPathname', () => {
  test('reads the path from a normal absolute URL', () => {
    expect(requestPathname('http://spotter.local/assets/app.js')).toBe(
      '/assets/app.js',
    )
  })

  test('root serves the app shell', () => {
    expect(requestPathname('http://spotter.local/')).toBe('/index.html')
  })

  test('a bare path does not throw', () => {
    // Bun leaves `request.url` relative when a request arrives without a usable
    // Host header (HTTP/1.0, a bare proxy). Parsing that unguarded threw, and
    // the server's error handler turned it into a 500 on every page load.
    expect(requestPathname('/')).toBe('/index.html')
    expect(requestPathname('/event/abc')).toBe('/event/abc')
  })

  test('the query string is not part of the path', () => {
    expect(requestPathname('/event/abc?from=push')).toBe('/event/abc')
  })
})
