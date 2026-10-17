import { describe, expect, it } from 'vitest'
import { stateWithCounts } from '../../core/fixtures'
import { buildSalesReport } from '../../core/report'
import type { TallyState } from '../../core/tally'
import { takumi } from './config'

const now = new Date('2026-10-15T21:00:00+09:00')

function withCounts(counts: Record<string, number>): TallyState {
  return stateWithCounts(counts, now)
}

describe('タクミ売上カウンター', () => {
  it('品目と単価（1,000・2,000・3,000・5,000円の串、ホタテ 1,000円、ビール 500円、ソフト 800円）', () => {
    expect(Object.fromEntries(takumi.prices.map((p) => [p.id, p.default]))).toEqual({
      skewer1: 1000,
      skewer2: 2000,
      skewer3: 3000,
      skewer4: 5000,
      hotate: 1000,
      beer: 500,
      soft: 800,
    })
    // 画面の見出しに ◾️ は付けない（報告文の見出しにだけ付ける）
    expect(takumi.sections.map((s) => s.title)).toEqual(['肉', 'ソフト'])
    expect(takumi.sections.map((s) => s.items.map((i) => i.name ?? i.priceId))).toEqual([
      ['skewer1', 'skewer2', 'skewer3', 'skewer4', 'ホタテ', 'ビール'],
      ['バニラ', 'ミックス', '抹茶'],
    ])
  })

  it('報告文がデモと同じ定型文になる', () => {
    const state = withCounts({ skewer1: 3, skewer2: 1, skewer4: 2, hotate: 2, beer: 4, vanilla: 2, matcha: 1 })
    expect(buildSalesReport(takumi, state, '21:00')).toBe(`売上報告
21:00時点

◾️肉
1,000×3
2,000×1
5,000×2
ホタテ×2
ビール×4
小計￥19,000-

◾️ソフト
バニラ×2
抹茶×1
小計￥2,400-

合計￥21,400-`)
  })
})
