import { describe, expect, it } from 'vitest'
import { denominations, validateCash } from './cash'

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
