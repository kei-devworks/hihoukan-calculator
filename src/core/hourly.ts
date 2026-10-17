/**
 * オーダーの記録を1時間ごとにまとめる（DOM に触れない）。「記録と推移」の画面に使う
 */

import { pieces, type Order } from './orders'
import { linesTotal, type TallyConfig, type TallyState } from './tally'
import { businessDate } from './time'

const HOUR_MS = 60 * 60_000
/** 何日分も記録が残っているときに、時間の行が増えすぎないようにする上限 */
const MAX_HOURS = 72

export type HourEntry = {
  kind: 'hour'
  /** その時間の始まり（端末の時刻で ◯時00分） */
  start: Date
  /** 「21時台」。記録が営業日をまたぐときは「10/14 18時台」 */
  label: string
  /** その時間に始めたお客さんのオーダー（古い順。取り消しを除く） */
  orders: Order[]
  /** その時間に始めて、取り消したオーダー（記録の一覧に薄く出す） */
  cancelled: Order[]
  pieces: number
  total: number
  /** その時間の終わりまでの累計（まとめて入れた数を含む） */
  cumulative: number
  /** オーダーが1件もない（押し忘れの目安） */
  empty: boolean
  /** 記録はないが、あとの引き継ぎ（まとめて入れた数）に含まれている時間。押し忘れとはみなさない */
  covered: boolean
  /** いまの時間 */
  current: boolean
}

/** 引き継ぎ・更新前の記録など、まとめて入れた数。時間ごとの売上には入れず、別の行に出す */
export type HandoverEntry = {
  kind: 'handover'
  order: Order
  pieces: number
  total: number
  cumulative: number
}

export type HourlyEntry = HourEntry | HandoverEntry

function floorHour(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
}

/**
 * 1時間ごとの行と、まとめて入れた数の行を、時刻の順に並べる。
 * 範囲は最初の記録の時間から、いまの時間（最後の記録と同じ営業日のうち）または最後の記録の時間まで
 */
export function hourlyEntries(config: TallyConfig, state: TallyState, now: Date): HourlyEntry[] {
  const all = [...state.orders].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
  const live = all.filter((o) => o.cancelledAt === null)
  if (live.length === 0) return []

  const firstAt = new Date(live[0]!.openedAt)
  const lastAt = new Date(live.at(-1)!.openedAt)
  const sameDay = businessDate(now, config.dayStartHour) === businessDate(lastAt, config.dayStartHour)
  const endAt = sameDay && now > lastAt ? now : lastAt
  // 今日の営業日でない記録があれば、時間に日付を付ける（前の営業日の数字が残っているとき）
  const multiDay = new Set([firstAt, endAt, now].map((d) => businessDate(d, config.dayStartHour))).size > 1

  const first = floorHour(firstAt).getTime()
  const last = Math.min(floorHour(endAt).getTime(), first + (MAX_HOURS - 1) * HOUR_MS)
  const currentHour = floorHour(now).getTime()
  const entries: HourlyEntry[] = []
  let cumulative = 0

  for (let t = first; t <= last; t += HOUR_MS) {
    const inHour = (o: Order) => {
      const at = Date.parse(o.openedAt)
      return at >= t && at < t + HOUR_MS
    }
    for (const order of live.filter((o) => o.kind === 'handover' && inHour(o))) {
      const total = linesTotal(config, state, order.lines)
      cumulative += total
      entries.push({ kind: 'handover', order, pieces: pieces(order.lines), total, cumulative })
    }
    const orders = live.filter((o) => o.kind === 'order' && inHour(o))
    const total = orders.reduce((sum, o) => sum + linesTotal(config, state, o.lines), 0)
    cumulative += total
    const start = new Date(t)
    entries.push({
      kind: 'hour',
      start,
      label: `${multiDay ? `${start.getMonth() + 1}/${start.getDate()} ` : ''}${start.getHours()}時台`,
      orders,
      cancelled: all.filter((o) => o.kind === 'order' && o.cancelledAt !== null && inHour(o)),
      pieces: orders.reduce((sum, o) => sum + pieces(o.lines), 0),
      total,
      cumulative,
      empty: orders.length === 0,
      covered: false,
      current: t === currentHour,
    })
  }

  // 記録のない時間は、同じ時間に引き継ぎがあるか、そのあとオーダーより先に引き継ぎが来ていれば、引き継ぎに含まれている
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.kind !== 'hour' || !entry.empty) continue
    const next = entries.slice(i + 1).find((e) => e.kind === 'handover' || !e.empty)
    entry.covered = entries[i - 1]?.kind === 'handover' || next?.kind === 'handover'
  }
  return entries
}
