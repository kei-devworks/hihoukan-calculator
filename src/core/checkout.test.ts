import { describe, expect, it } from 'vitest'
import { addItemForCustomer, changeDue, isPaid, tenderBreakdown, tenderTotal } from './checkout'
import { sampleConfig as config } from './fixtures'
import { addItem, addTender, removeTender } from './orders'
import { initialState } from './tally'

const now = new Date('2026-10-15T21:00:00+09:00')
const later = new Date('2026-10-15T21:01:00+09:00')

describe('預かりの足し算', () => {
  it('押した額面を足し、内訳を大きい順に数える', () => {
    expect(tenderTotal([1000, 500, 1000])).toBe(2500)
    expect(tenderBreakdown([1000, 500, 1000, 10000])).toEqual([
      { denomination: 10000, count: 1 },
      { denomination: 1000, count: 2 },
      { denomination: 500, count: 1 },
    ])
  })

  it('addTender で1枚ずつ足し、removeTender で最後の1枚・全部を戻す', () => {
    let state = addItem(initialState(), 'a', now)
    state = addTender(addTender(state, 1, 1000, now), 1, 500, now)
    expect(state.orders[0]!.tenders).toEqual([1000, 500])
    expect(removeTender(state, 1, now).orders[0]!.tenders).toEqual([1000])
    expect(removeTender(state, 1, now, true).orders[0]!.tenders).toEqual([])
    expect(addTender(state, 1, -5, now)).toBe(state)
  })
})

describe('changeDue（お釣り）', () => {
  it('預かりがなければ none、足りなければ short、届いたら change（0 はちょうど）', () => {
    expect(changeDue(2500, 0)).toEqual({ kind: 'none' })
    expect(changeDue(2500, 2000)).toEqual({ kind: 'short', amount: 500 })
    expect(changeDue(2500, 2500)).toEqual({ kind: 'change', amount: 0 })
    expect(changeDue(2500, 5000)).toEqual({ kind: 'change', amount: 2500 })
  })
})

describe('addItemForCustomer（会計のあとの ＋ は次のお客さん）', () => {
  it('会計が済んでいれば、今のオーダーを閉じて次のオーダーを始める', () => {
    let state = addItem(initialState(), 'a', now) // 1,000円
    state = addTender(state, 1, 1000, now)
    expect(isPaid(config, state, state.orders[0]!)).toBe(true)
    state = addItemForCustomer(config, state, 'b', later)
    expect(state.orders.map((o) => o.lines)).toEqual([{ a: 1 }, { b: 1 }])
    expect(state.orders[0]!.closedAt).toBe(later.toISOString())
  })

  it('預かりが足りないうちは、同じオーダーに足す', () => {
    let state = addItem(initialState(), 'b', now) // 2,000円
    state = addTender(state, 1, 1000, now)
    expect(isPaid(config, state, state.orders[0]!)).toBe(false)
    state = addItemForCustomer(config, state, 'a', later)
    expect(state.orders).toHaveLength(1)
    expect(state.orders[0]!.lines).toEqual({ b: 1, a: 1 })
  })
})
