import { describe, expect, it } from 'vitest'
import { parseHash, toHash, type Route } from './router'

describe('router', () => {
  it('parseHash', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('#/write/abc-123')).toEqual({ name: 'write', id: 'abc-123' })
    expect(parseHash('#/licenses')).toEqual({ name: 'licenses' })
    expect(parseHash('#/delete-account')).toEqual({ name: 'delete-account' })
  })

  it('알 수 없거나 형식이 틀린 경로는 홈으로 간다', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'home' })
    expect(parseHash('#/write/')).toEqual({ name: 'home' })
    expect(parseHash('#/write/a/b')).toEqual({ name: 'home' })
    expect(parseHash('#/write/<script>')).toEqual({ name: 'home' })
  })

  it('toHash는 parseHash와 왕복한다', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'write', id: 'x-1' }, { name: 'licenses' }, { name: 'terms' }, { name: 'privacy' }, { name: 'delete-account' }]
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r)
    expect(toHash({ name: 'write', id: 'x-1' })).toBe('#/write/x-1')
  })

  it('toHash는 형식이 틀린 id 로 주소를 만들지 않고 홈으로 보낸다', () => {
    const uuid = '0f3a9c1e-12ab-4cde-9f00-1234567890ab'
    expect(toHash({ name: 'post', author: uuid, id: uuid })).toBe(`#/p/${uuid}/${uuid}`)
    expect(toHash({ name: 'profile', id: uuid })).toBe(`#/u/${uuid}`)
    expect(toHash({ name: 'profile', id: '../admin' })).toBe('#/')
    expect(toHash({ name: 'profile', id: '' })).toBe('#/')
    expect(toHash({ name: 'post', author: 'a/b', id: 'p1' })).toBe('#/')
    expect(toHash({ name: 'post', author: 'other', id: 'p1?x=1' })).toBe('#/')
    expect(toHash({ name: 'write', id: 'x'.repeat(65) })).toBe('#/')
    expect(toHash({ name: 'write', id: '<script>' })).toBe('#/')
  })
})
