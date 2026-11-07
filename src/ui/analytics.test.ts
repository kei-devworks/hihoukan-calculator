// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://kei-devworks.github.io/hihoukan-calculator/takumi/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COUNT_RELAY_URL } from '../core/analytics'
import { countVisit } from './analytics'

const KEY = 'hihoukan-calc:analytics:v1'
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

/** 送った本文（JSON）を順に */
const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
const sentPaths = () => sentBodies().map((b) => b.p)
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown

beforeEach(() => {
  document.title = 'タクミ売上カウンター'
  fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', { ...navigator, webdriver: false })
  vi.stubGlobal('alert', vi.fn())
})

afterEach(() => {
  localStorage.removeItem(KEY)
  history.replaceState(null, '', '/hihoukan-calculator/takumi/')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('countVisit', () => {
  it('その月にはじめて開いたら、ページの閲覧と「使った端末」を送る。2回目はページの閲覧だけ', () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T10:00:00+09:00'), toFake: ['Date'] })
    countVisit('/takumi')
    expect(sentBodies()).toEqual([
      { p: '/takumi', t: 'タクミ売上カウンター' },
      { p: 'device-2026-11', t: '2026年11月に使った端末', e: true },
    ])
    expect(saved()).toEqual({ deviceMonth: '2026-11', off: false })

    countVisit('/takumi')
    expect(sentPaths()).toEqual(['/takumi', 'device-2026-11', '/takumi'])
  })

  it('GoatCounter ではなく中継に、fetch の POST（text/plain・keepalive）で送る', () => {
    countVisit('/takumi')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(COUNT_RELAY_URL)
    expect(url).not.toContain('goatcounter')
    expect(init).toMatchObject({ method: 'POST', mode: 'no-cors', keepalive: true })
    expect(typeof init?.body).toBe('string')
  })

  it('#hikitsugi= など URL の # のあとは送らない', () => {
    history.replaceState(null, '', '/hihoukan-calculator/takumi/#hikitsugi=secret')
    countVisit('/takumi')
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('secret')
    expect(location.hash).toBe('#hikitsugi=secret')
  })

  it('#count-off で、この端末を数えなくなる。#count-on で戻る', () => {
    history.replaceState(null, '', '/hihoukan-calculator/#count-off')
    countVisit('/')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(location.hash).toBe('')
    expect(alert).toHaveBeenCalledWith('この端末の閲覧は、これから数えません。')

    countVisit('/takumi')
    expect(fetchMock).not.toHaveBeenCalled()

    history.replaceState(null, '', '/hihoukan-calculator/#count-on')
    countVisit('/')
    expect(sentPaths()[0]).toBe('/')
  })

  it('自動テスト（navigator.webdriver）では送らない', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: true })
    countVisit('/takumi')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('送れなくても例外を投げない', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('blocked')))
    expect(() => countVisit('/takumi')).not.toThrow()
    await Promise.resolve()
    vi.stubGlobal('fetch', () => {
      throw new TypeError('blocked')
    })
    expect(() => countVisit('/takumi')).not.toThrow()
  })
})
