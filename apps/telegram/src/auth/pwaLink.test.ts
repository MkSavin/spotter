import { describe, expect, test } from 'bun:test'
import type { ServiceStatus } from '@spotter/transport'
import { authorizeLink, pwaUrl } from './pwaLink'

const service = (over: Partial<ServiceStatus> = {}): ServiceStatus =>
  ({
    service: 'pwa',
    version: '1.0.0',
    node: 'cloud',
    uptime: 100,
    at: Date.now(),
    online: true,
    details: { url: 'http://pwa.spotter.host' },
    ...over,
  }) as ServiceStatus

describe('pwaUrl', () => {
  test('находит адрес живого PWA', () => {
    expect(pwaUrl([service()])).toBe('http://pwa.spotter.host')
  })

  test('нет PWA — нет ссылки', () => {
    expect(pwaUrl([service({ service: 'server' })])).toBeNull()
  })

  test('молчащий PWA не предлагается', () => {
    // Ссылка на страницу, которая не откроется, хуже отсутствия ссылки.
    expect(pwaUrl([service({ online: false })])).toBeNull()
  })

  test('PWA без объявленного адреса пропускается', () => {
    expect(pwaUrl([service({ details: undefined })])).toBeNull()
    expect(pwaUrl([service({ details: { url: '  ' } })])).toBeNull()
  })

  test('не-http адрес отвергается', () => {
    // Значение приходит по шине, а человек по этой ссылке нажмёт.
    expect(
      pwaUrl([service({ details: { url: 'javascript:alert(1)' } })]),
    ).toBeNull()
    expect(pwaUrl([service({ details: { url: 'не ссылка' } })])).toBeNull()
  })

  test('хвостовой слэш убирается, чтобы не было двойного', () => {
    expect(pwaUrl([service({ details: { url: 'https://x.test/' } })])).toBe(
      'https://x.test',
    )
  })
})

describe('authorizeLink', () => {
  test('складывает ссылку одного касания', () => {
    expect(authorizeLink('https://x.test', 'xK3p-Rd9Qm2A')).toBe(
      'https://x.test/authorize?code=xK3p-Rd9Qm2A',
    )
  })

  test('экранирует код, чтобы ссылка не развалилась', () => {
    expect(authorizeLink('https://x.test', 'a+b/c')).toBe(
      'https://x.test/authorize?code=a%2Bb%2Fc',
    )
  })
})
