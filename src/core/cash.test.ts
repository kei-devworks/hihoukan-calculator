import { describe, expect, it } from 'vitest'
import {
  BUNDLE,
  clearCashCount,
  compareCash,
  countsAmount,
  denominations,
  emptyCashCount,
  floatKeys,
  floatNowOf,
  parseCashCount,
  sameAmountNames,
  setCashCount,
  setFloatUsed,
  settle,
  validateCash,
  type CashCount,
  type CashField,
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

  it('空・0 以下・小数・重複・束の金額の誤りを見つける', () => {
    expect(validateCash({ bills: [], coins: [] })).toEqual(['cash に額面がありません'])
    expect(validateCash({ bills: [1000], coins: [100], bundle: 0 })).toEqual(['束の金額「0」は 1 以上の整数にしてください'])
    expect(validateCash({ bills: [1000, 1000], coins: [0, 50.5] })).toEqual([
      '額面「0」は 1 以上の整数にしてください',
      '額面「50.5」は 1 以上の整数にしてください',
      '額面「1000」が重複しています',
    ])
  })
})

const cash = { bills: [10000, 5000, 1000], coins: [500, 100], bundle: 10000 }

/** 数をまとめて入れる（[欄, 額面か BUNDLE, 数]） */
function counted(...entries: [CashField, number | string, number][]): CashCount {
  return entries.reduce((c, [field, key, n]) => setCashCount(c, field, key, n), emptyCashCount())
}

/** 開店時の釣り銭準備金: 1万円の束 2束・500円玉 10枚・100円玉 60枚（￥31,000） */
const opening: [CashField, number | string, number][] = [
  ['floatStart', BUNDLE, 2],
  ['floatStart', 500, 10],
  ['floatStart', 100, 60],
]
/** 売上バッグ: 10,000円札 3枚・1,000円札 4枚・500円玉 1枚・100円玉 10枚（￥35,500） */
const bag: [CashField, number | string, number][] = [
  ['bag', 10000, 3],
  ['bag', 1000, 4],
  ['bag', 500, 1],
  ['bag', 100, 10],
]

describe('枚数と金額', () => {
  it('枚数から金額を出す。束は束1つの金額で数える。欄を空にすると持たない', () => {
    let c = counted(['bag', 10000, 2], ['bag', 500, 3], ['floatStart', BUNDLE, 2])
    expect(countsAmount(c.bag)).toBe(21500)
    expect(countsAmount(c.floatStart, cash)).toBe(20000)
    c = setCashCount(c, 'bag', 500, null)
    expect(c.bag).toEqual({ '10000': 2 })
    expect(() => setCashCount(c, 'bag', 500, -1)).toThrow()
    expect(() => setCashCount(c, 'bag', 500, 1.5)).toThrow()
  })

  it('釣り銭準備金の並びは束 → 硬貨の大きい順。束の設定がなければ硬貨だけ', () => {
    expect(floatKeys(cash)).toEqual([BUNDLE, '500', '100'])
    expect(floatKeys({ bills: [1000], coins: [100, 500] })).toEqual(['500', '100'])
  })

  it('いまの釣り銭準備金は、入れていない欄は開店時の数。リセットすると開店時だけ残す', () => {
    const c = setFloatUsed(counted(...opening, ...bag, ['floatNow', 500, 8]), true)
    expect(floatNowOf(c, '500')).toBe(8)
    expect(floatNowOf(c, '100')).toBe(60)
    expect(floatNowOf(c, BUNDLE)).toBe(2)
    expect(clearCashCount(c)).toEqual({ ...emptyCashCount(), floatStart: { bundle: 2, '500': 10, '100': 60 } })
  })
})

describe('settle・compareCash（お金から出した売上と、数えた売上の比べ方）', () => {
  it('使っていない: お金から出した売上 = 売上バッグ（釣り銭準備金は数えない）', () => {
    const c = setFloatUsed(counted(...opening, ...bag), false)
    expect(settle(c, cash)).toEqual({
      floatUsed: false, floatStart: 31000, floatNow: 31000, bag: 35500, total: 35500, sales: 35500, counted: true, changed: [],
    })
  })

  it('使った: お金から出した売上 =（釣り銭準備金のいま ＋ 売上バッグ）− 開店時の釣り銭準備金', () => {
    const c = setFloatUsed(counted(...opening, ...bag, ['floatNow', 500, 8], ['floatNow', 100, 55]), true)
    expect(settle(c, cash)).toEqual({
      floatUsed: true,
      floatStart: 31000,
      floatNow: 29500,
      bag: 35500,
      total: 65000,
      sales: 34000,
      counted: true,
      changed: [
        { key: '500', from: 10, to: 8 },
        { key: '100', from: 60, to: 55 },
      ],
    })
    expect(compareCash(settle(c, cash), 33000)).toEqual({ kind: 'over', amount: 1000 })
    expect(compareCash(settle(c, cash), 34000)).toEqual({ kind: 'match' })
    expect(compareCash(settle(c, cash), 34500)).toEqual({ kind: 'under', amount: 500 })
  })

  it('使ったときに 100円玉だけ直しても、500円玉は開店時のまま（0枚あつかいにしない）', () => {
    const c = setFloatUsed(counted(...opening, ...bag, ['floatNow', 100, 55]), true)
    expect(settle(c, cash)).toMatchObject({ floatNow: 30500, sales: 35000, changed: [{ key: '100', from: 60, to: 55 }] })
  })

  it('使ったのに何も直さなければ、使っていないときと同じ売上になる（わからないときは［使った］でよい）', () => {
    const base = counted(...opening, ...bag)
    expect(settle(setFloatUsed(base, true), cash).sales).toBe(settle(setFloatUsed(base, false), cash).sales)
  })

  it('束を崩して売上バッグに入れても、売上は合う', () => {
    // ￥35,500 売れたあと、￥3,000 の品に 10,000円札を受け取り、束を1つ崩して 1,000円札 7枚をお釣りに出した（残りの 3枚は売上バッグへ）
    const c = setFloatUsed(counted(...opening, ...bag, ['bag', 10000, 4], ['bag', 1000, 7], ['floatNow', BUNDLE, 1]), true)
    expect(settle(c, cash)).toMatchObject({ total: 69500, sales: 38500, changed: [{ key: BUNDLE, from: 2, to: 1 }] })
  })

  it('使ったかを選んでいない・売上バッグを数えていなければ比べない', () => {
    expect(compareCash(settle(counted(...opening, ...bag), cash), 1000)).toEqual({ kind: 'none' })
    expect(compareCash(settle(setFloatUsed(counted(...opening), true), cash), 1000)).toEqual({ kind: 'none' })
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
  it('設定にない額面・数でない枚数は捨てる。釣り銭準備金は束と硬貨だけ', () => {
    expect(
      parseCashCount(
        {
          floatStart: { bundle: 2, '100': 30, '1000': 2 },
          floatUsed: true,
          bag: { '1000': 3, '2000': 1, '500': -1 },
          floatNow: 'x',
        },
        cash,
      ),
    ).toEqual({ floatStart: { bundle: 2, '100': 30 }, floatUsed: true, bag: { '1000': 3 }, floatNow: {} })
    expect(parseCashCount({ floatStart: { bundle: 2 } }, { bills: [1000], coins: [100] }).floatStart).toEqual({})
    expect(parseCashCount(null, cash)).toEqual(emptyCashCount())
  })

  it('前の形（売上のポケットと硬貨の釣り銭準備金）は、ポケットを売上バッグとして読み、いまを数えていたら「使った」にする', () => {
    expect(parseCashCount({ pocket: { '1000': 3 }, floatStart: { '100': 30 }, floatNow: { '100': 22 } }, cash)).toEqual({
      floatStart: { '100': 30 },
      floatUsed: true,
      bag: { '1000': 3 },
      floatNow: { '100': 22 },
    })
    expect(parseCashCount({ pocket: { '1000': 3 }, floatStart: { '100': 30 }, floatNow: {} }, cash)).toMatchObject({ floatUsed: null })
  })
})
