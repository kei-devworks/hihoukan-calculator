import { describe, expect, it } from 'vitest'
import { sampleConfig as config } from './fixtures'
import { buildSalesReport } from './report'
import { bump, initialState, setPrice, type TallyState } from './tally'

const now = new Date('2026-10-15T21:00:00+09:00')

function withCounts(counts: Record<string, number>): TallyState {
  let state = initialState()
  for (const [id, n] of Object.entries(counts)) state = bump(state, id, n, now)
  return state
}

describe('buildSalesReport', () => {
  it('定型文の形で、数えた品目だけを書く', () => {
    const state = withCounts({ a: 3, hotate: 2, vanilla: 2 })
    expect(buildSalesReport(config, state, '21:00')).toBe(
      [
        '売上報告',
        '21:00時点',
        '',
        '◾️肉',
        '1,000×3',
        'ホタテ×2',
        '小計￥5,000-',
        '',
        '◾️ソフト',
        'バニラ×2',
        '小計￥1,600-',
        '',
        '合計￥6,600-',
      ].join('\n'),
    )
  })

  it('何も数えていなくても、見出し・小計・合計は書く', () => {
    expect(buildSalesReport(config, initialState(), '10:00')).toBe(
      ['売上報告', '10:00時点', '', '◾️肉', '小計￥0-', '', '◾️ソフト', '小計￥0-', '', '合計￥0-'].join('\n'),
    )
  })

  it('品目は設定の順に並ぶ（数えた順ではない）', () => {
    const state = withCounts({ hotate: 1, b: 1, a: 1 })
    expect(buildSalesReport(config, state, '12:00')).toContain('1,000×1\n2,000×1\nホタテ×1\n')
  })

  it('単価を変えると、値段で呼ぶ品目の名前と金額が変わる', () => {
    const state = setPrice(config, withCounts({ a: 2 }), 'a', 1500)
    const report = buildSalesReport(config, state, '12:00')
    expect(report).toContain('1,500×2\n小計￥3,000-')
    expect(report).toContain('合計￥3,000-')
  })
})
