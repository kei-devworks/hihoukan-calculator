import { describe, expect, it } from 'vitest'
import { sampleConfig as config } from './fixtures'
import {
  allItems,
  bump,
  carriedOverSince,
  displayName,
  grandTotal,
  hasCounts,
  initialState,
  parseState,
  priceOf,
  reportName,
  resetCounts,
  resetPrices,
  sectionTotal,
  setPrice,
  validateConfig,
  type TallyConfig,
  type TallyState,
} from './tally'

const now = new Date('2026-10-15T12:00:00+09:00')
const section = (id: string) => config.sections.find((s) => s.id === id)!
const item = (id: string) => allItems(config).find((i) => i.id === id)!
const meat = section('meat')
const soft = section('soft')

/** 品目 id と個数の組から状態を作る */
function withCounts(counts: Record<string, number>): TallyState {
  let state = initialState()
  for (const [id, n] of Object.entries(counts)) state = bump(state, id, n, now)
  return state
}

describe('bump', () => {
  it('個数を増減し、更新時刻を記録する', () => {
    const state = bump(bump(initialState(), 'a', 1, now), 'a', 1, now)
    expect(state.counts).toEqual({ a: 2 })
    expect(state.updatedAt).toBe(now.toISOString())
    expect(bump(state, 'a', -1, now).counts).toEqual({ a: 1 })
  })

  it('0 より下にはならず、0 になった品目は持たない', () => {
    const state = bump(withCounts({ a: 1 }), 'a', -5, now)
    expect(state.counts).toEqual({})
  })

  it('元の状態は書き換えない', () => {
    const before = withCounts({ a: 1 })
    bump(before, 'a', 1, now)
    expect(before.counts).toEqual({ a: 1 })
  })

  it('0 から数え始めた時刻を記録し、あとから足しても変えない', () => {
    const later = new Date('2026-10-15T15:00:00+09:00')
    const state = bump(bump(initialState(), 'a', 1, now), 'b', 1, later)
    expect(state.startedAt).toBe(now.toISOString())
    expect(state.updatedAt).toBe(later.toISOString())
  })

  it('全部 0 に戻ると、数え始めの時刻も消える', () => {
    expect(bump(withCounts({ a: 1 }), 'a', -1, now).startedAt).toBeNull()
  })
})

describe('carriedOverSince（前の営業日の数字が残っているか）', () => {
  // dayStartHour は 4。深夜 3:59 までは前日の営業日
  const startedAt = (iso: string) => bump(initialState(), 'a', 1, new Date(iso))

  it('前の営業日に数え始めていれば、その時刻を返す', () => {
    const state = startedAt('2026-10-14T18:00:00+09:00')
    expect(carriedOverSince(config, state, new Date('2026-10-15T10:00:00+09:00'))).toEqual(
      new Date('2026-10-14T18:00:00+09:00'),
    )
  })

  it('残った数字に今日の分を足しても、前の営業日の数字のまま', () => {
    const state = bump(startedAt('2026-10-14T18:00:00+09:00'), 'b', 1, new Date('2026-10-15T10:00:00+09:00'))
    expect(carriedOverSince(config, state, new Date('2026-10-15T10:01:00+09:00'))).not.toBeNull()
  })

  it('深夜営業で日付をまたいでも、同じ営業日なら null', () => {
    const state = startedAt('2026-10-14T18:00:00+09:00')
    expect(carriedOverSince(config, state, new Date('2026-10-15T01:30:00+09:00'))).toBeNull()
  })

  it('同じ営業日・数えていない・リセット後は null', () => {
    const state = startedAt('2026-10-15T09:00:00+09:00')
    const today = new Date('2026-10-15T20:00:00+09:00')
    expect(carriedOverSince(config, state, today)).toBeNull()
    expect(carriedOverSince(config, initialState(), today)).toBeNull()
    expect(carriedOverSince(config, resetCounts(startedAt('2026-10-14T18:00:00+09:00')), today)).toBeNull()
  })
})

describe('合計', () => {
  it('品目ごとの 個数 × 単価 を見出しごと・全体で足す', () => {
    const state = withCounts({ a: 3, b: 1, hotate: 2, vanilla: 2, matcha: 1 })
    expect(sectionTotal(config, state, meat)).toBe(3 * 1000 + 2000 + 2 * 1000)
    expect(sectionTotal(config, state, soft)).toBe(3 * 800)
    expect(grandTotal(config, state)).toBe(7000 + 2400)
  })

  it('何も数えていなければ 0', () => {
    expect(grandTotal(config, initialState())).toBe(0)
    expect(hasCounts(initialState())).toBe(false)
  })
})

describe('単価', () => {
  it('変えていなければ既定値、変えたらその値', () => {
    const state = setPrice(config, initialState(), 'a', 1200)
    expect(priceOf(config, initialState(), 'a')).toBe(1000)
    expect(priceOf(config, state, 'a')).toBe(1200)
  })

  it('共有している単価を変えると、それを使う品目すべてに効く', () => {
    const state = setPrice(config, withCounts({ vanilla: 1, matcha: 1 }), 'soft', 900)
    expect(sectionTotal(config, state, soft)).toBe(1800)
  })

  it('既定と同じ値に戻したら、変更なしの扱いになる', () => {
    const changed = setPrice(config, initialState(), 'a', 1200)
    expect(setPrice(config, changed, 'a', 1000).priceOverrides).toEqual({})
  })

  it('負の数・NaN は 0、小数は切り捨て', () => {
    expect(setPrice(config, initialState(), 'a', -100).priceOverrides).toEqual({ a: 0 })
    expect(setPrice(config, initialState(), 'a', Number.NaN).priceOverrides).toEqual({ a: 0 })
    expect(setPrice(config, initialState(), 'a', 1234.9).priceOverrides).toEqual({ a: 1234 })
  })

  it('resetPrices ですべて既定に戻る', () => {
    const state = setPrice(config, setPrice(config, initialState(), 'a', 1), 'soft', 2)
    expect(resetPrices(state).priceOverrides).toEqual({})
  })

  it('設定にない単価は例外', () => {
    expect(() => setPrice(config, initialState(), 'nope', 1)).toThrow()
  })
})

describe('品目名', () => {
  const a = item('a')
  const hotate = item('hotate')

  it('名前がない品目は単価を名前にする（画面は「円」付き、報告文は数字だけ）', () => {
    expect(displayName(config, initialState(), a)).toBe('1,000円')
    expect(reportName(config, initialState(), a)).toBe('1,000')
  })

  it('単価を変えると名前も変わる', () => {
    const state = setPrice(config, initialState(), 'a', 1500)
    expect(displayName(config, state, a)).toBe('1,500円')
  })

  it('名前がある品目はその名前', () => {
    expect(displayName(config, initialState(), hotate)).toBe('ホタテ')
    expect(reportName(config, initialState(), hotate)).toBe('ホタテ')
  })
})

describe('resetCounts', () => {
  it('個数と時刻を消し、単価の変更は残す', () => {
    const state = setPrice(config, withCounts({ a: 2, vanilla: 1 }), 'a', 1200)
    const reset = resetCounts(state)
    expect(reset.counts).toEqual({})
    expect(reset.updatedAt).toBeNull()
    expect(reset.startedAt).toBeNull()
    expect(reset.priceOverrides).toEqual({ a: 1200 })
  })
})

describe('parseState（保存されていた値を戻す）', () => {
  it('正しい値はそのまま戻る', () => {
    const state = setPrice(config, withCounts({ a: 2, vanilla: 1 }), 'soft', 900)
    expect(parseState(config, JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it.each([null, undefined, 'text', 123, [], { counts: 'x' }])('壊れた値 %j は空の状態になる', (raw) => {
    expect(parseState(config, raw)).toEqual(initialState())
  })

  it('設定にない品目・負の数・小数・数でない値は捨てる', () => {
    const state = parseState(config, {
      counts: { a: 2, removed: 5, b: -1, hotate: 1.5, vanilla: '3', matcha: 0 },
    })
    expect(state.counts).toEqual({ a: 2 })
  })

  it('設定にない単価・既定と同じ単価は捨てる', () => {
    const state = parseState(config, { priceOverrides: { a: 1000, b: 2500, gone: 1 } })
    expect(state.priceOverrides).toEqual({ b: 2500 })
  })

  it('日時として読めない時刻は捨てる。数え始めがなければ更新時刻で代える', () => {
    const iso = '2026-10-14T09:00:00.000Z'
    expect(parseState(config, { counts: { a: 1 }, updatedAt: 'yesterday' }).updatedAt).toBeNull()
    expect(parseState(config, { counts: { a: 1 }, updatedAt: iso }).startedAt).toBe(iso)
  })

  it('数えていなければ、時刻は残っていても持たない', () => {
    const iso = '2026-10-14T09:00:00.000Z'
    const state = parseState(config, { counts: {}, updatedAt: iso, startedAt: iso })
    expect(state.updatedAt).toBeNull()
    expect(state.startedAt).toBeNull()
  })
})

describe('validateConfig', () => {
  it('正しい設定ではエラーなし', () => {
    expect(validateConfig(config)).toEqual([])
  })

  it('重複・存在しない単価・使われていない単価・不正な値を見つける', () => {
    const broken: TallyConfig = {
      ...config,
      id: 'Bad ID',
      dayStartHour: 24,
      prices: [
        { id: 'a', label: 'A', default: 100 },
        { id: 'a', label: 'A2', default: -1 },
        { id: 'unused', label: 'U', default: 100 },
      ],
      sections: [
        { id: 's', title: 'S', items: [{ id: 'x', priceId: 'a' }, { id: 'x', priceId: 'missing' }] },
        { id: 's', title: 'S2', items: [] },
      ],
    }
    const errors = validateConfig(broken)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ページの id'),
        expect.stringContaining('dayStartHour'),
        expect.stringContaining('単価の id「a」が重複'),
        expect.stringContaining('既定値は 0 以上の整数'),
        expect.stringContaining('見出しの id「s」が重複'),
        expect.stringContaining('品目の id「x」が重複'),
        expect.stringContaining('「missing」が prices にありません'),
        expect.stringContaining('「unused」はどの品目にも使われていません'),
      ]),
    )
  })
})
