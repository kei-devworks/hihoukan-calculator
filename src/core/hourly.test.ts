import { describe, expect, it } from 'vitest'
import { sampleConfig as config } from './fixtures'
import { hourlyEntries, type HourEntry, type HourlyEntry } from './hourly'
import { addItem, cancelOrder, type Order } from './orders'
import { initialState, type TallyState } from './tally'

/** 2026-10-15 の h時m分（端末の時刻 = 日本時間） */
const t = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m)

function press(state: TallyState, ...taps: [string, Date][]): TallyState {
  return taps.reduce((s, [id, at]) => addItem(s, id, at), state)
}

/** まとめて入れた数（引き継ぎ）を記録の最後に足す */
function withHandover(state: TallyState, lines: Record<string, number>, at: Date): TallyState {
  const iso = at.toISOString()
  const order: Order = {
    id: state.orders.length + 1,
    kind: 'handover',
    openedAt: iso,
    lastAt: iso,
    closedAt: iso,
    lines,
    tenders: [],
    edits: [],
    cancelledAt: null,
    source: '16:00時点の報告',
  }
  return { ...state, orders: [...state.orders, order] }
}

const hours = (entries: HourlyEntry[]) => entries.filter((e): e is HourEntry => e.kind === 'hour')
const brief = (entries: HourlyEntry[]) =>
  entries.map((e) =>
    e.kind === 'hour'
      ? `${e.label} ${e.orders.length}件 ${e.total} 累計${e.cumulative}${e.empty ? (e.covered ? ' 引き継ぎに含む' : ' 記録なし') : ''}${e.current ? ' いま' : ''}`
      : `引き継ぎ ${e.pieces}点 ${e.total} 累計${e.cumulative}`,
  )

describe('hourlyEntries', () => {
  it('記録がなければ何もない', () => {
    expect(hourlyEntries(config, initialState(), t(21))).toEqual([])
  })

  it('始めた時刻で1時間ごとに分け、件数・売上・累計を出す。記録のない時間も並べる', () => {
    const state = press(
      initialState(),
      ['a', t(18, 10)], // 1件目 18時台
      ['b', t(18, 30)], // 2件目 18時台
      ['hotate', t(20, 5)], // 3件目 20時台
      ['vanilla', t(20, 6)], // 同じオーダー
    )
    expect(brief(hourlyEntries(config, state, t(21, 15)))).toEqual([
      '18時台 2件 3000 累計3000',
      '19時台 0件 0 累計3000 記録なし',
      '20時台 1件 1800 累計4800',
      '21時台 0件 0 累計4800 記録なし いま',
    ])
  })

  it('取り消したオーダーしかなくても、その時間を並べる（記録の一覧から元に戻せるように）', () => {
    const state = cancelOrder(press(initialState(), ['a', t(18, 10)]), 1, t(18, 11))
    expect(brief(hourlyEntries(config, state, t(18, 20)))).toEqual(['18時台 0件 0 累計0 記録なし いま'])
    expect(hours(hourlyEntries(config, state, t(18, 20)))[0]!.cancelled.map((o) => o.id)).toEqual([1])
  })

  it('取り消したオーダーは数に入れず、別に持つ', () => {
    let state = press(initialState(), ['a', t(18, 10)], ['b', t(18, 30)])
    state = cancelOrder(state, 2, t(18, 31))
    const [hour] = hours(hourlyEntries(config, state, t(18, 40)))
    expect(hour!.orders.map((o) => o.id)).toEqual([1])
    expect(hour!.cancelled.map((o) => o.id)).toEqual([2])
    expect(hour!.total).toBe(1000)
  })

  it('引き継ぎは別の行にし、累計には入れる。引き継ぎより前・同じ時間の記録のない時間は、引き継ぎに含む', () => {
    let state = press(initialState(), ['a', t(12, 10)])
    state = withHandover(state, { a: 5, vanilla: 2 }, t(14, 5)) // 休憩から戻って、代わりの人の分を入れた
    state = press(state, ['b', t(14, 20)])
    expect(brief(hourlyEntries(config, state, t(14, 30)))).toEqual([
      '12時台 1件 1000 累計1000',
      '13時台 0件 0 累計1000 引き継ぎに含む',
      '引き継ぎ 7点 6600 累計7600',
      '14時台 1件 2000 累計9600 いま',
    ])
  })

  it('引き継ぎから始めた端末は、引き継ぎの時間から並べる', () => {
    const state = withHandover(initialState(), { a: 2 }, t(16, 42))
    expect(brief(hourlyEntries(config, state, t(17, 5)))).toEqual([
      '引き継ぎ 2点 2000 累計2000',
      '16時台 0件 0 累計2000 引き継ぎに含む',
      '17時台 0件 0 累計2000 記録なし いま',
    ])
  })

  it('深夜 0時を過ぎても時刻の順に並べ、同じ営業日なら日付は付けない', () => {
    const state = press(initialState(), ['a', t(23, 50)], ['b', t(0, 10, 16)])
    expect(hours(hourlyEntries(config, state, t(0, 20, 16))).map((h) => h.label)).toEqual(['23時台', '0時台'])
  })

  it('前の営業日の記録が残っているときは、日付を付け、最後の記録の時間までにする', () => {
    const state = press(initialState(), ['a', t(18, 0, 14)], ['b', t(19, 0, 14)])
    // 次の日の昼に開いた（いまの時間までは並べない）
    expect(hours(hourlyEntries(config, state, t(12, 0))).map((h) => h.label)).toEqual(['10/14 18時台', '10/14 19時台'])
  })
})
