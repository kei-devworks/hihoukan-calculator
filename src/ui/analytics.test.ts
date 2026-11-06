// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://kei-devworks.github.io/hihoukan-calculator/takumi/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countVisit } from './analytics'

const KEY = 'hihoukan-calc:analytics:v1'
let sent: string[]

const sentPaths = () => sent.map((url) => new URL(url).searchParams.get('p'))
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown

beforeEach(() => {
  sent = []
  document.title = 'タクミ売上カウンター'
  vi.stubGlobal('navigator', {
    ...navigator,
    webdriver: false,
    sendBeacon: (url: string) => {
      sent.push(url)
      return true
    },
  })
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
    expect(sentPaths()).toEqual(['/takumi', 'device-2026-11'])
    expect(new URL(sent[0]!).searchParams.get('t')).toBe('タクミ売上カウンター')
    expect(saved()).toEqual({ deviceMonth: '2026-11', off: false })

    countVisit('/takumi')
    expect(sentPaths()).toEqual(['/takumi', 'device-2026-11', '/takumi'])
  })

  it('#hikitsugi= など URL の # のあとは送らない', () => {
    history.replaceState(null, '', '/hihoukan-calculator/takumi/#hikitsugi=secret')
    countVisit('/takumi')
    expect(sent.join('\n')).not.toContain('secret')
    expect(location.hash).toBe('#hikitsugi=secret')
  })

  it('#count-off で、この端末を数えなくなる。#count-on で戻る', () => {
    history.replaceState(null, '', '/hihoukan-calculator/#count-off')
    countVisit('/')
    expect(sent).toEqual([])
    expect(location.hash).toBe('')
    expect(alert).toHaveBeenCalledWith('この端末の閲覧は、これから数えません。')

    countVisit('/takumi')
    expect(sent).toEqual([])

    history.replaceState(null, '', '/hihoukan-calculator/#count-on')
    countVisit('/')
    expect(sentPaths()[0]).toBe('/')
  })

  it('自動テスト（navigator.webdriver）では送らない', () => {
    vi.stubGlobal('navigator', { ...navigator, webdriver: true })
    countVisit('/takumi')
    expect(sent).toEqual([])
  })

  it('sendBeacon が使えなければ fetch で送る', () => {
    const fetch = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('navigator', { ...navigator, webdriver: false, sendBeacon: () => false })
    countVisit('/takumi')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]).toEqual([expect.stringContaining('p=%2Ftakumi'), { mode: 'no-cors', keepalive: true }])
  })

  it('送れなくても例外を投げない', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      webdriver: false,
      sendBeacon: () => {
        throw new Error('blocked')
      },
    })
    expect(() => countVisit('/takumi')).not.toThrow()
  })
})
