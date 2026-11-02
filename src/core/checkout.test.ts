import { describe, expect, it } from 'vitest'
import { changeDue, receiptGroups, tenderBreakdown, tenderTotal } from './checkout'
import { sampleConfig as config } from './fixtures'
import { addItem, addTender, removeTender } from './orders'
import { addCustomItem, initialState } from './tally'

const now = new Date('2026-10-15T21:00:00+09:00')

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

describe('receiptGroups（会計のレシートのジャンル）', () => {
  it('品目をジャンルにまとめ、品目の画面と同じ順に並べる。1品だけのジャンルは single', () => {
    const groups = receiptGroups(config, initialState(), { vanilla: 2, b: 1, a: 3, hotate: 2 })
    expect(groups).toEqual([
      {
        en: 'Wagyu A5',
        ja: 'A5和牛',
        single: false,
        lines: [
          { itemId: 'a', en: '¥1,000', ja: null, count: 3, amount: 3000 },
          { itemId: 'b', en: '¥2,000', ja: null, count: 1, amount: 2000 },
        ],
      },
      { en: 'Scallop', ja: 'ホタテ', single: true, lines: [{ itemId: 'hotate', en: 'Scallop', ja: 'ホタテ', count: 2, amount: 2000 }] },
      {
        en: 'Cremia Soft Serve',
        ja: 'クレミア ソフトクリーム',
        single: false,
        lines: [{ itemId: 'vanilla', en: 'Vanilla', ja: 'バニラ', count: 2, amount: 1600 }],
      },
    ])
  })

  it('値段の範囲は、画面から足した値段だけの品目にも効く。範囲の外は値段だけの1行', () => {
    let state = addCustomItem(initialState(), 'meat', '', 3000, now)
    state = addCustomItem(state, 'meat', '', 5000, now)
    const [inRange, outside] = state.customItems
    const groups = receiptGroups(config, state, { [inRange!.id]: 1, [outside!.id]: 1 })
    expect(groups.map((g) => [g.en, g.single, g.lines.map((l) => l.en)])).toEqual([
      ['Wagyu A5', false, ['¥3,000']],
      ['¥5,000', true, ['¥5,000']],
    ])
  })

  it('ジャンルに入らない名前のある品目は、日本語名のまま1行', () => {
    const state = addCustomItem(initialState(), 'soft', 'コーン', 300, now)
    const corn = state.customItems[0]!
    expect(receiptGroups(config, state, { matcha: 1, [corn.id]: 2 })).toEqual([
      { en: '抹茶', ja: null, single: true, lines: [{ itemId: 'matcha', en: '抹茶', ja: null, count: 1, amount: 800 }] },
      { en: 'コーン', ja: null, single: true, lines: [{ itemId: corn.id, en: 'コーン', ja: null, count: 2, amount: 600 }] },
    ])
  })

  it('ジャンルを書いていないページは、品目ごとに1行', () => {
    const plain = { ...config, receipt: undefined }
    expect(receiptGroups(plain, initialState(), { a: 1, hotate: 1 }).map((g) => [g.en, g.ja, g.single])).toEqual([
      ['¥1,000', null, true],
      ['ホタテ', null, true],
    ])
  })
})
