import { describe, expect, it } from 'vitest'
import { grandStockTotal, initialStockState, sectionResult, setField, type StockState } from '../../core/stock'
import { neko } from './config'

const now = new Date('2026-10-15T18:00:00+09:00')

/** 品目 id → [開店時, 追加, 残数] */
function day(entries: Record<string, [number, number | null, number]>): StockState {
  let state = initialStockState()
  for (const [id, [start, added, remaining]] of Object.entries(entries)) {
    state = setField(state, id, 'start', start, now)
    state = setField(state, id, 'added', added, now)
    state = setField(state, id, 'remaining', remaining, now)
  }
  return state
}

describe('ネコ・グリコ売上カウンター', () => {
  it('単価はステッカー 1,000円・絵馬 500円・手形 500円', () => {
    expect(Object.fromEntries(neko.prices.map((p) => [p.label, p.default]))).toEqual({
      ステッカー: 1000,
      絵馬: 500,
      手形: 500,
    })
  })

  it('弓道と手裏剣に、それぞれステッカー・絵馬・手形がある', () => {
    expect(neko.sections.map((s) => [s.title, s.items.map((i) => i.name)])).toEqual([
      ['弓道', ['ステッカー', '絵馬', '手形']],
      ['手裏剣', ['ステッカー', '絵馬', '手形']],
    ])
  })

  it('1日分の売上を、弓道と手裏剣で分けて出す', () => {
    const state = day({
      // 開店時, 追加, 残数
      'kyudo-sticker': [20, 10, 12], // 18枚 × 1,000
      'kyudo-ema': [15, null, 9], //     6枚 × 500
      'kyudo-tegata': [10, null, 10], // 0枚
      'shuriken-sticker': [30, null, 25], // 5枚 × 1,000
      'shuriken-ema': [12, 6, 4], //       14枚 × 500
      'shuriken-tegata': [8, null, 5], //   3枚 × 500
    })
    const [kyudo, shuriken] = neko.sections
    expect(sectionResult(neko, state, kyudo!).amount).toBe(18000 + 3000)
    expect(sectionResult(neko, state, shuriken!).amount).toBe(5000 + 7000 + 1500)
    expect(grandStockTotal(neko, state)).toBe(21000 + 13500)
  })
})
