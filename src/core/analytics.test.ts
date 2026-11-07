import { describe, expect, it } from 'vitest'
import {
  countUrl,
  deviceHit,
  GOATCOUNTER_ENDPOINT,
  monthKey,
  parseAnalyticsState,
  parseRelayBody,
  relayBody,
  shouldCount,
  toggleByHash,
  visitHits,
  type AnalyticsState,
} from './analytics'

const fresh: AnalyticsState = { deviceMonth: null, off: false }
const live = { hostname: 'kei-devworks.github.io', webdriver: false, off: false }

describe('parseAnalyticsState', () => {
  it('保存した値を読み戻す', () => {
    expect(parseAnalyticsState({ deviceMonth: '2026-11', off: true })).toEqual({ deviceMonth: '2026-11', off: true })
  })

  it('ない・壊れているときは初期値', () => {
    expect(parseAnalyticsState(null)).toEqual(fresh)
    expect(parseAnalyticsState('2026-11')).toEqual(fresh)
    expect(parseAnalyticsState({ deviceMonth: '11月', off: 'yes' })).toEqual(fresh)
    expect(parseAnalyticsState({ deviceMonth: 202611 })).toEqual(fresh)
  })
})

describe('shouldCount', () => {
  it('本番の URL で、ふつうに開いたときだけ数える', () => {
    expect(shouldCount(live)).toBe(true)
  })

  it.each(['localhost', '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.20', '0.0.0.0', '[::1]', 'app.localhost'])(
    '手元（%s）では数えない',
    (hostname) => {
      expect(shouldCount({ ...live, hostname })).toBe(false)
    },
  )

  it('172.16〜31 の外は手元とみなさない', () => {
    expect(shouldCount({ ...live, hostname: '172.32.0.1' })).toBe(true)
  })

  it('自動テスト（navigator.webdriver）では数えない', () => {
    expect(shouldCount({ ...live, webdriver: true })).toBe(false)
  })

  it('この端末を数えない設定なら数えない', () => {
    expect(shouldCount({ ...live, off: true })).toBe(false)
  })
})

describe('toggleByHash', () => {
  it('#count-off で数えなくなり、#count-on で戻る', () => {
    const off = toggleByHash('#count-off', { deviceMonth: '2026-11', off: false })
    expect(off).toEqual({ deviceMonth: '2026-11', off: true })
    expect(toggleByHash('#count-on', off!)).toEqual({ deviceMonth: '2026-11', off: false })
  })

  it('ほかの # では何もしない', () => {
    expect(toggleByHash('', fresh)).toBeNull()
    expect(toggleByHash('#hikitsugi=abc', fresh)).toBeNull()
    expect(toggleByHash('#count-offf', fresh)).toBeNull()
  })
})

describe('monthKey', () => {
  it('端末の時刻での月（月の境目は日本時間）', () => {
    expect(monthKey(new Date('2026-11-30T23:59:59+09:00'))).toBe('2026-11')
    expect(monthKey(new Date('2026-12-01T00:00:00+09:00'))).toBe('2026-12')
    expect(monthKey(new Date('2027-01-01T08:00:00+09:00'))).toBe('2027-01')
  })
})

describe('visitHits', () => {
  const page = { path: '/takumi', title: 'タクミ売上カウンター' }

  it('その月にはじめて開いたら、ページの閲覧と「使った端末」を送り、月を覚える', () => {
    const { page: pageHit, device, next } = visitHits(fresh, page, new Date('2026-11-06T10:00:00+09:00'))
    expect(pageHit).toEqual({ path: '/takumi', title: 'タクミ売上カウンター' })
    expect(device).toEqual({ path: 'device-2026-11', title: '2026年11月に使った端末', event: true })
    expect(next).toEqual({ deviceMonth: '2026-11', off: false })
  })

  it('同じ月の2回目からは、ページの閲覧だけ送る', () => {
    const state = { deviceMonth: '2026-11', off: false }
    const { device, next } = visitHits(state, page, new Date('2026-11-30T23:00:00+09:00'))
    expect(device).toBeNull()
    expect(next).toBe(state)
  })

  it('月が変わったら、また「使った端末」を送る', () => {
    const { device } = visitHits({ deviceMonth: '2026-11', off: false }, page, new Date('2026-12-01T09:00:00+09:00'))
    expect(device?.path).toBe('device-2026-12')
  })
})

describe('deviceHit', () => {
  it('月は 0 を付けずに書く', () => {
    expect(deviceHit('2027-01').title).toBe('2027年1月に使った端末')
  })
})

describe('relayBody / parseRelayBody', () => {
  it('ページの閲覧と「使った端末」が、送ったとおりに読み戻せる', () => {
    const page = { path: '/takumi', title: 'タクミ売上カウンター' }
    expect(relayBody(page)).toBe('{"p":"/takumi","t":"タクミ売上カウンター"}')
    expect(parseRelayBody(relayBody(page))).toEqual(page)
    expect(parseRelayBody(relayBody({ path: '/', title: '秘宝館 計算機' }))).toEqual({ path: '/', title: '秘宝館 計算機' })
    expect(parseRelayBody(relayBody(deviceHit('2026-11')))).toEqual(deviceHit('2026-11'))
  })

  it.each([
    ['JSON でない', 'p=/takumi'],
    ['配列', '[]'],
    ['ページの id の形でない', '{"p":"https://example.com/","t":"x"}'],
    ['大文字・記号の入った id', '{"p":"/Takumi?x=1","t":"x"}'],
    ['題名がない', '{"p":"/takumi"}'],
    ['題名が長すぎる', JSON.stringify({ p: '/takumi', t: 'あ'.repeat(101) })],
    ['ページの閲覧をイベントにしている', '{"p":"/takumi","t":"x","e":true}'],
    ['「使った端末」がイベントでない', '{"p":"device-2026-11","t":"x"}'],
    ['月の形でない「使った端末」', '{"p":"device-11","t":"x","e":true}'],
  ])('%s ものは受け付けない', (_, raw) => {
    expect(parseRelayBody(raw)).toBeNull()
  })
})

describe('countUrl', () => {
  it('ページの閲覧は p・t・ns=1 を送る', () => {
    const url = new URL(countUrl(GOATCOUNTER_ENDPOINT, { path: '/takumi', title: 'タクミ売上カウンター' }, 'abcde'))
    expect(url.origin + url.pathname).toBe('https://hihoukan-calc.goatcounter.com/count')
    expect(Object.fromEntries(url.searchParams)).toEqual({ p: '/takumi', t: 'タクミ売上カウンター', ns: '1', rnd: 'abcde' })
  })

  it('イベントには e=true を付ける', () => {
    const url = new URL(countUrl(GOATCOUNTER_ENDPOINT, deviceHit('2026-11')))
    expect(url.searchParams.get('p')).toBe('device-2026-11')
    expect(url.searchParams.get('e')).toBe('true')
    expect(url.searchParams.get('rnd')).toMatch(/^[a-z0-9]+$/)
  })

  it('題名の記号や空白も崩れずに届く', () => {
    const url = new URL(countUrl(GOATCOUNTER_ENDPOINT, { path: '/check', title: 'QR の読み取り & 確認?#' }))
    expect(url.searchParams.get('t')).toBe('QR の読み取り & 確認?#')
    expect(url.hash).toBe('')
  })
})
