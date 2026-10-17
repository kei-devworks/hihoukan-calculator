import { describe, expect, it } from 'vitest'
import { emptyCashCount, setCashCount } from './cash'
import { allItems } from './catalog'
import { sampleStockConfig as config } from './fixtures'
import {
  carryRemainingToStart,
  entryOf,
  grandStockTotal,
  initialStockState,
  itemResult,
  parseStockState,
  resetStock,
  sectionCashOf,
  sectionResult,
  setField,
  setSectionCash,
  settleSection,
  settlementOf,
  stockCarriedOverSince,
  type StockEntry,
  type StockState,
} from './stock'

const now = new Date('2026-10-15T10:00:00+09:00')
const item = (id: string) => allItems(config).find((i) => i.id === id)!
const section = (id: string) => config.sections.find((s) => s.id === id)!

/** 品目 id → [開店時, 追加, 残数] から状態を作る */
function withEntries(entries: Record<string, [number | null, number | null, number | null]>, at = now): StockState {
  let state = initialStockState()
  for (const [id, [start, added, remaining]] of Object.entries(entries)) {
    state = setField(state, id, 'start', start, at)
    state = setField(state, id, 'added', added, at)
    state = setField(state, id, 'remaining', remaining, at)
  }
  return state
}

describe('setField', () => {
  it('欄ごとに記録し、入れ始めと最後の更新の時刻を残す', () => {
    const later = new Date('2026-10-15T18:00:00+09:00')
    const state = setField(setField(initialStockState(), 'a-sticker', 'start', 20, now), 'a-sticker', 'remaining', 7, later)
    expect(entryOf(state, 'a-sticker')).toEqual<StockEntry>({ start: 20, added: null, remaining: 7 })
    expect(state.startedAt).toBe(now.toISOString())
    expect(state.updatedAt).toBe(later.toISOString())
  })

  it('0 と空欄（null）を区別する', () => {
    const state = setField(initialStockState(), 'a-ema', 'remaining', 0, now)
    expect(entryOf(state, 'a-ema').remaining).toBe(0)
  })

  it('全部の欄を空に戻した品目は持たず、全品目が空なら時刻も消える', () => {
    const state = setField(setField(initialStockState(), 'a-ema', 'start', 5, now), 'a-ema', 'start', null, now)
    expect(state).toEqual(initialStockState())
  })

  it('0 以上の整数でない値は例外', () => {
    expect(() => setField(initialStockState(), 'a-ema', 'start', -1, now)).toThrow()
    expect(() => setField(initialStockState(), 'a-ema', 'start', 1.5, now)).toThrow()
  })
})

describe('itemResult', () => {
  it('売れた数 = 開店時 + 追加 − 残数、売上 = 売れた数 × 単価', () => {
    const state = withEntries({ 'a-sticker': [20, 10, 12] })
    expect(itemResult(config, state, item('a-sticker'))).toEqual({ status: 'ok', stock: 30, sold: 18, amount: 18000 })
  })

  it('追加が空欄なら 0 として計算する', () => {
    const state = withEntries({ 'a-ema': [10, null, 4] })
    expect(itemResult(config, state, item('a-ema'))).toEqual({ status: 'ok', stock: 10, sold: 6, amount: 3000 })
  })

  it('何も売れていなければ 0 個・0 円', () => {
    const state = withEntries({ 'a-ema': [10, null, 10] })
    expect(itemResult(config, state, item('a-ema'))).toMatchObject({ status: 'ok', sold: 0, amount: 0 })
  })

  it('何も入れていなければ empty', () => {
    expect(itemResult(config, initialStockState(), item('a-ema'))).toEqual({ status: 'empty' })
  })

  it('残数がまだなら needRemaining（その時点の在庫つき）', () => {
    const state = withEntries({ 'a-ema': [10, 5, null] })
    expect(itemResult(config, state, item('a-ema'))).toEqual({ status: 'needRemaining', stock: 15 })
  })

  it('開店時の在庫がなければ needStart', () => {
    const state = withEntries({ 'a-ema': [null, 5, 2] })
    expect(itemResult(config, state, item('a-ema'))).toEqual({ status: 'needStart' })
  })

  it('残数が在庫より多ければ tooMany（入れまちがい）', () => {
    const state = withEntries({ 'a-ema': [10, 2, 13] })
    expect(itemResult(config, state, item('a-ema'))).toEqual({ status: 'tooMany', stock: 12, remaining: 13 })
  })
})

describe('sectionResult / grandStockTotal', () => {
  it('見出しごとに売上を分けて出す', () => {
    const state = withEntries({
      'a-sticker': [20, null, 15],
      'a-ema': [10, 5, 3],
      'b-sticker': [8, null, 6],
    })
    const a = sectionResult(config, state, section('a'))
    const b = sectionResult(config, state, section('b'))
    expect(a.amount).toBe(5 * 1000 + 12 * 500)
    expect(a.sold.map((s) => [s.item.id, s.sold])).toEqual([
      ['a-sticker', 5],
      ['a-ema', 12],
    ])
    expect(b.amount).toBe(2 * 1000)
    expect(grandStockTotal(config, state)).toBe(11000 + 2000)
  })

  it('計算できない品目は売上に入れず、未入力・要確認として数える', () => {
    const state = withEntries({
      'a-sticker': [20, null, null],
      'a-ema': [10, null, 11],
    })
    expect(sectionResult(config, state, section('a'))).toEqual({ amount: 0, sold: [], pending: 1, problems: 1 })
  })
})

describe('前の日の記録', () => {
  const yesterday = new Date('2026-10-14T10:00:00+09:00')

  it('前の営業日に入れ始めた記録なら、その時刻を返す', () => {
    const state = withEntries({ 'a-ema': [10, null, 4] }, yesterday)
    expect(stockCarriedOverSince(config, state, now)).toEqual(yesterday)
    expect(stockCarriedOverSince(config, withEntries({ 'a-ema': [10, null, 4] }), now)).toBeNull()
  })

  it('残数を今日の開店時の在庫に移す（残数のない品目は空にする）', () => {
    const state = withEntries({ 'a-sticker': [20, 5, 12], 'a-ema': [10, null, null] }, yesterday)
    const today = carryRemainingToStart(state, now)
    expect(today.entries).toEqual({ 'a-sticker': { start: 12, added: null, remaining: null } })
    expect(today.startedAt).toBe(now.toISOString())
    expect(stockCarriedOverSince(config, today, now)).toBeNull()
  })

  it('resetStock で全部消える（記録がなければ、はじめと同じ）', () => {
    expect(resetStock(initialStockState())).toEqual(initialStockState())
  })
})

describe('parseStockState（保存されていた値を戻す）', () => {
  it('正しい値はそのまま戻る', () => {
    const state = withEntries({ 'a-sticker': [20, 5, 12], 'b-ema': [3, null, null] })
    expect(parseStockState(config, JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it.each([null, 'text', 1, [], { entries: [] }])('壊れた値 %j は空の状態になる', (raw) => {
    expect(parseStockState(config, raw)).toEqual(initialStockState())
  })

  it('設定にない品目・負の数・小数・数でない値は捨てる', () => {
    const state = parseStockState(config, {
      entries: {
        'a-sticker': { start: 20, added: -1, remaining: '3' },
        'a-ema': { start: 1.5 },
        removed: { start: 9 },
      },
      updatedAt: '2026-10-15T01:00:00.000Z',
    })
    expect(state.entries).toEqual({ 'a-sticker': { start: 20, added: null, remaining: null } })
    expect(state.startedAt).toBe('2026-10-15T01:00:00.000Z')
  })
})

describe('見出しごとのレジ精算と、精算の印', () => {
  const later = new Date('2026-10-15T21:30:00+09:00')
  const pocket = (n: number) => setCashCount(emptyCashCount(), 'pocket', 1000, n)

  it('枚数は見出しごとに別々に持ち、欄を書き換えても残る', () => {
    let state = setSectionCash(withEntries({ 'a-sticker': [20, null, 12] }), 'a', pocket(8), later)
    state = setField(state, 'b-ema', 'start', 5, later)
    expect(sectionCashOf(state, 'a').pocket).toEqual({ '1000': 8 })
    expect(sectionCashOf(state, 'b')).toEqual(emptyCashCount())
    expect(state.updatedAt).toBe(later.toISOString())
  })

  it('精算を終えると印が付き、そのあとで在庫の欄か枚数が変わったらわかる', () => {
    let state = setSectionCash(withEntries({ 'a-sticker': [20, null, 12] }), 'a', pocket(8), now)
    state = settleSection(state, section('a'), later)
    expect(settlementOf(state, section('a'))).toEqual({ at: later.toISOString(), changed: false })
    expect(settlementOf(state, section('b'))).toBeNull()
    // ほかの見出しの欄を変えても、変わったことにはしない
    expect(settlementOf(setField(state, 'b-ema', 'start', 3, later), section('a'))?.changed).toBe(false)
    expect(settlementOf(setField(state, 'a-sticker', 'remaining', 11, later), section('a'))?.changed).toBe(true)
    expect(settlementOf(setSectionCash(state, 'a', pocket(9), later), section('a'))?.changed).toBe(true)
  })

  it('全部消す・残数を開店時に移すと、ポケットといまの枚数と精算の印は消え、準備金の開店時の枚数は残る', () => {
    let count = setCashCount(pocket(8), 'floatStart', 100, 30)
    count = setCashCount(count, 'floatNow', 100, 25)
    let state = setSectionCash(withEntries({ 'a-sticker': [20, null, 12] }), 'a', count, now)
    state = settleSection(state, section('a'), later)
    const kept = { pocket: {}, floatStart: { '100': 30 }, floatNow: {} }
    expect(resetStock(state)).toMatchObject({ entries: {}, cash: { a: kept }, settled: {} })
    expect(carryRemainingToStart(state, later)).toMatchObject({ cash: { a: kept }, settled: {} })
  })

  it('保存した枚数と精算の印を読み戻す。設定にない見出し・壊れた印は捨てる', () => {
    let state = setSectionCash(withEntries({ 'a-sticker': [20, null, 12] }), 'a', pocket(8), now)
    state = settleSection(state, section('a'), later)
    expect(parseStockState(config, JSON.parse(JSON.stringify(state)))).toEqual(state)
    const raw = { ...JSON.parse(JSON.stringify(state)), cash: { gone: { pocket: { '1000': 1 } } }, settled: { a: { at: 'x' } } }
    const parsed = parseStockState(config, raw)
    expect(parsed.cash).toEqual({})
    expect(parsed.settled).toEqual({})
  })
})
