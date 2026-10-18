import { describe, expect, it } from 'vitest'
import {
  clearCashCount,
  compareCash,
  countsAmount,
  denominations,
  emptyCashCount,
  floatUnused,
  parseCashCount,
  sameAmountNames,
  setCashCount,
  settle,
  validateCash,
  type CashCount,
} from './cash'

describe('denominations', () => {
  it('お札と硬貨を大きい順に並べる', () => {
    expect(denominations({ bills: [1000, 10000, 5000], coins: [100, 500] })).toEqual([10000, 5000, 1000, 500, 100])
  })
})

describe('validateCash', () => {
  it('正しい設定ではエラーなし', () => {
    expect(validateCash({ bills: [10000, 5000, 1000], coins: [500, 100] })).toEqual([])
  })

  it('空・0 以下・小数・重複を見つける', () => {
    expect(validateCash({ bills: [], coins: [] })).toEqual(['cash に額面がありません'])
    expect(validateCash({ bills: [1000, 1000], coins: [0, 50.5] })).toEqual([
      '額面「0」は 1 以上の整数にしてください',
      '額面「50.5」は 1 以上の整数にしてください',
      '額面「1000」が重複しています',
    ])
  })
})

const cash = { bills: [10000, 5000, 1000], coins: [500, 100] }

/** 枚数をまとめて入れる（[欄, 額面, 枚数]） */
function counted(...entries: [keyof CashCount, number, number][]): CashCount {
  return entries.reduce((c, [field, d, n]) => setCashCount(c, field, d, n), emptyCashCount())
}

describe('枚数と金額', () => {
  it('枚数から金額を出す。欄を空にすると額面を持たない', () => {
    let c = counted(['pocket', 10000, 2], ['pocket', 500, 3])
    expect(countsAmount(c.pocket)).toBe(21500)
    c = setCashCount(c, 'pocket', 500, null)
    expect(c.pocket).toEqual({ '10000': 2 })
    expect(() => setCashCount(c, 'pocket', 500, -1)).toThrow()
    expect(() => setCashCount(c, 'pocket', 500, 1.5)).toThrow()
  })

  it('［使っていない］はいまの準備金を開店時と同じにし、リセットすると開店時の枚数だけ残す', () => {
    const c = counted(['pocket', 1000, 3], ['floatStart', 100, 30], ['floatNow', 100, 20])
    expect(floatUnused(c).floatNow).toEqual({ '100': 30 })
    expect(clearCashCount(c)).toEqual({ pocket: {}, floatStart: { '100': 30 }, floatNow: {} })
  })
})

describe('settle・compareCash（売上のお金と、数えた売上の比べ方）', () => {
  it('売上のお金 = ポケット −（開店時の準備金 − いまの準備金）', () => {
    const c = counted(
      ['pocket', 10000, 2], ['pocket', 5000, 3], ['pocket', 1000, 10], ['pocket', 500, 2], ['pocket', 100, 11],
      ['floatStart', 500, 6], ['floatStart', 100, 30], ['floatNow', 500, 6], ['floatNow', 100, 22],
    )
    expect(settle(c)).toEqual({
      pocket: 47100, floatStart: 6000, floatNow: 5200, floatUsed: 800, sales: 46300, counted: true, floatProblem: null,
    })
    expect(compareCash(settle(c), 45500)).toEqual({ kind: 'over', amount: 800 })
    expect(compareCash(settle(c), 46300)).toEqual({ kind: 'match' })
    expect(compareCash(settle(c), 47000)).toEqual({ kind: 'under', amount: 700 })
  })

  it('ポケットを数えていなければ比べない', () => {
    expect(compareCash(settle(emptyCashCount()), 1000)).toEqual({ kind: 'none' })
  })

  it('準備金: いまを数えていない・開店時がない・いまのほうが多いときは知らせ、使った分は 0 として計算する', () => {
    expect(settle(counted(['pocket', 1000, 1], ['floatStart', 100, 30])).floatProblem).toBe('noNow')
    expect(settle(counted(['pocket', 1000, 1], ['floatNow', 100, 3])).floatProblem).toBe('noStart')
    const grew = settle(counted(['pocket', 1000, 1], ['floatStart', 100, 10], ['floatNow', 100, 12]))
    expect(grew).toMatchObject({ floatProblem: 'grew', floatUsed: 0, sales: 1000 })
    // 準備金を使わないお店（開店時もいまも入れない）は、知らせない
    expect(settle(counted(['pocket', 1000, 1])).floatProblem).toBeNull()
  })
})

describe('sameAmountNames', () => {
  it('差と同じ単価の品目の名前を、重ならないように返す', () => {
    const items = [
      { name: 'バニラ', price: 800 },
      { name: '抹茶', price: 800 },
      { name: 'ホタテ', price: 1000 },
      { name: 'バニラ', price: 800 },
    ]
    expect(sameAmountNames(800, items)).toEqual(['バニラ', '抹茶'])
    expect(sameAmountNames(300, items)).toEqual([])
  })
})

describe('parseCashCount', () => {
  it('設定にない額面・数でない枚数は捨てる。準備金は硬貨だけ', () => {
    expect(
      parseCashCount({ pocket: { '1000': 3, '2000': 1, '500': -1 }, floatStart: { '100': 30, '1000': 2 }, floatNow: 'x' }, cash),
    ).toEqual({ pocket: { '1000': 3 }, floatStart: { '100': 30 }, floatNow: {} })
    expect(parseCashCount(null, cash)).toEqual(emptyCashCount())
  })
})
