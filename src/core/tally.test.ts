import { describe, expect, it } from 'vitest'
import { sampleConfig as config, stateWithCounts } from './fixtures'
import { addItem, removeItem } from './orders'
import {
  allItems,
  carriedOverSince,
  countsOf,
  displayName,
  grandTotal,
  hasCounts,
  initialState,
  linesTotal,
  parseState,
  priceOf,
  reportName,
  resetCounts,
  resetPrices,
  sectionTotal,
  setPrice,
  startedAtOf,
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
  return stateWithCounts(counts, now)
}

describe('countsOf（個数はすべてのオーダーから数える）', () => {
  it('オーダーをまたいで品目ごとに足し、取り消したオーダーは入れない', () => {
    const at = (min: number) => new Date(now.getTime() + min * 60_000)
    let state = addItem(addItem(initialState(), 'a', at(0)), 'b', at(0))
    state = addItem(state, 'a', at(10)) // 3分たったので次のオーダー
    expect(state.orders).toHaveLength(2)
    expect(countsOf(state)).toEqual({ a: 2, b: 1 })

    const cancelled = { ...state, orders: state.orders.map((o) => (o.id === 1 ? { ...o, cancelledAt: at(11).toISOString() } : o)) }
    expect(countsOf(cancelled)).toEqual({ a: 1 })
  })

  it('オーダーの中身の金額は、いまの単価で出す', () => {
    const state = setPrice(config, initialState(), 'a', 1200)
    expect(linesTotal(config, state, { a: 2, vanilla: 1 })).toBe(2 * 1200 + 800)
  })
})

describe('carriedOverSince（前の営業日の数字が残っているか）', () => {
  // dayStartHour は 4。深夜 3:59 までは前日の営業日
  const startedAt = (iso: string) => addItem(initialState(), 'a', new Date(iso))

  it('前の営業日に数え始めていれば、その時刻を返す', () => {
    const state = startedAt('2026-10-14T18:00:00+09:00')
    expect(carriedOverSince(config, state, new Date('2026-10-15T10:00:00+09:00'))).toEqual(
      new Date('2026-10-14T18:00:00+09:00'),
    )
  })

  it('残った数字に今日の分を足しても、前の営業日の数字のまま', () => {
    const state = addItem(startedAt('2026-10-14T18:00:00+09:00'), 'b', new Date('2026-10-15T10:00:00+09:00'))
    expect(carriedOverSince(config, state, new Date('2026-10-15T10:01:00+09:00'))).not.toBeNull()
  })

  it('数え始めた時刻は、取り消していないいちばん古いオーダーの時刻', () => {
    const state = addItem(startedAt('2026-10-14T18:00:00+09:00'), 'b', new Date('2026-10-15T10:00:00+09:00'))
    expect(startedAtOf(state)).toBe(new Date('2026-10-14T18:00:00+09:00').toISOString())
    // 前の日のオーダーを − で空にすると取り消し済みになり、今日の数字だけになる
    const { state: today } = removeItem(state, 'a', new Date('2026-10-15T10:01:00+09:00'))
    expect(startedAtOf(today)).toBe(new Date('2026-10-15T10:00:00+09:00').toISOString())
    expect(carriedOverSince(config, today, new Date('2026-10-15T10:02:00+09:00'))).toBeNull()
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
  it('オーダーの記録と時刻を消し、単価の変更は残す', () => {
    const state = setPrice(config, withCounts({ a: 2, vanilla: 1 }), 'a', 1200)
    const reset = resetCounts(state)
    expect(reset.orders).toEqual([])
    expect(countsOf(reset)).toEqual({})
    expect(reset.updatedAt).toBeNull()
    expect(startedAtOf(reset)).toBeNull()
    expect(reset.priceOverrides).toEqual({ a: 1200 })
  })

  it('レジ精算はポケットといまの枚数を消し、釣り銭準備金の開店時の枚数は残す', () => {
    const state = { ...withCounts({ a: 1 }), cash: { pocket: { '1000': 3 }, floatStart: { '100': 30 }, floatNow: { '100': 28 } } }
    expect(resetCounts(state).cash).toEqual({ pocket: {}, floatStart: { '100': 30 }, floatNow: {} })
  })
})

describe('parseState（保存されていた値を戻す）', () => {
  const at = (min: number) => new Date(now.getTime() + min * 60_000)

  it('正しい値はそのまま戻る（閉じたオーダー・今のオーダー・直した記録・取り消し・預かり）', () => {
    let state = addItem(addItem(initialState(), 'a', at(0)), 'a', at(1))
    state = addItem(state, 'hotate', at(10))
    state = removeItem(state, 'a', at(11)).state // 前のオーダーから減らす（直した記録が残る）
    state = setPrice(config, state, 'soft', 900)
    state = { ...state, orders: state.orders.map((o) => (o.id === 1 ? { ...o, tenders: [1000, 500] } : o)) }
    state = { ...state, cash: { pocket: { '1000': 3 }, floatStart: { '100': 30 }, floatNow: { '100': 28 } } }
    expect(parseState(config, JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it.each([null, undefined, 'text', 123, [], { orders: 'x' }, { counts: 'x' }])('壊れた値 %j は空の状態になる', (raw) => {
    expect(parseState(config, raw)).toEqual(initialState())
  })

  it('壊れたオーダー・設定にない品目・空のオーダー・順番の狂った id は捨てる', () => {
    const base = { kind: 'order', openedAt: at(0).toISOString(), lastAt: at(0).toISOString(), closedAt: null, cancelledAt: null }
    const state = parseState(config, {
      orders: [
        { ...base, id: 1, lines: { a: 2, removed: 5, b: -1, hotate: 1.5, vanilla: '3' } },
        { ...base, id: 2, lines: { removed: 1 } }, // 中身が全部消える
        { ...base, id: 1, lines: { a: 1 } }, // id が戻っている
        { ...base, id: 3, kind: 'other', lines: { a: 1 } },
        { ...base, id: 4, openedAt: 'yesterday', lines: { a: 1 } },
        { ...base, id: 5, lines: { matcha: 1 }, tenders: [1000, -5, 'x'], edits: [{ at: 'bad' }, { at: at(1).toISOString(), before: { matcha: 2 } }] },
      ],
      updatedAt: at(2).toISOString(),
    })
    expect(state.orders.map((o) => o.id)).toEqual([1, 5])
    expect(state.orders[0]!.lines).toEqual({ a: 2 })
    expect(state.orders[1]!.tenders).toEqual([1000])
    expect(state.orders[1]!.edits).toEqual([{ at: at(1).toISOString(), before: { matcha: 2 } }])
    expect(state.updatedAt).toBe(at(2).toISOString())
  })

  it('版 1 の保存（品目ごとの個数）は、数え始めた時刻の「まとめて入れた数」1件にする', () => {
    const started = '2026-10-14T09:00:00.000Z'
    const state = parseState(config, {
      counts: { a: 2, removed: 5, b: -1, vanilla: 1 },
      priceOverrides: { a: 1200 },
      updatedAt: '2026-10-14T10:00:00.000Z',
      startedAt: started,
    })
    expect(state.orders).toEqual([
      {
        id: 1,
        kind: 'handover',
        openedAt: started,
        lastAt: started,
        closedAt: started,
        lines: { a: 2, vanilla: 1 },
        tenders: [],
        edits: [],
        cancelledAt: null,
        source: '更新前の記録',
      },
    ])
    expect(countsOf(state)).toEqual({ a: 2, vanilla: 1 })
    expect(state.priceOverrides).toEqual({ a: 1200 })
    expect(startedAtOf(state)).toBe(started)
  })

  it('版 1 で数え始めの時刻がなければ更新時刻を使い、どちらもなければ前の日の数字として扱う', () => {
    const updated = '2026-10-14T10:00:00.000Z'
    expect(parseState(config, { counts: { a: 1 }, updatedAt: updated }).orders[0]!.openedAt).toBe(updated)
    const unknown = parseState(config, { counts: { a: 1 } })
    expect(carriedOverSince(config, unknown, now)).not.toBeNull()
  })

  it('設定にない単価・既定と同じ単価は捨てる', () => {
    const state = parseState(config, { priceOverrides: { a: 1000, b: 2500, gone: 1 } })
    expect(state.priceOverrides).toEqual({ b: 2500 })
  })

  it('記録がなければ、更新時刻は残っていても持たない', () => {
    const state = parseState(config, { orders: [], updatedAt: '2026-10-14T09:00:00.000Z' })
    expect(state.updatedAt).toBeNull()
    expect(hasCounts(state)).toBe(false)
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
