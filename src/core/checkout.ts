/**
 * 会計の預かりとお釣り（DOM に触れない）。預かりは押した額面の並び（Order.tenders）で持つ
 */

import { addItem, closeOrder, openOrder, type Order } from './orders'
import { linesTotal, type TallyConfig, type TallyState } from './tally'

export function tenderTotal(tenders: readonly number[]): number {
  return tenders.reduce((sum, d) => sum + d, 0)
}

/** 預かりの内訳（額面の大きい順に、額面と枚数） */
export function tenderBreakdown(tenders: readonly number[]): { denomination: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const d of tenders) counts.set(d, (counts.get(d) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => b - a).map(([denomination, count]) => ({ denomination, count }))
}

export type ChangeDue =
  /** まだ何も預かっていない */
  | { kind: 'none' }
  /** 預かりが足りない */
  | { kind: 'short'; amount: number }
  /** お釣り（0 ならちょうど） */
  | { kind: 'change'; amount: number }

export function changeDue(total: number, tendered: number): ChangeDue {
  if (tendered <= 0) return { kind: 'none' }
  return tendered < total ? { kind: 'short', amount: total - tendered } : { kind: 'change', amount: tendered - total }
}

/** 預かりが合計に届いたか（会計が済んだか） */
export function isPaid(config: TallyConfig, state: TallyState, order: Order): boolean {
  const tendered = tenderTotal(order.tenders)
  return tendered > 0 && tendered >= linesTotal(config, state, order.lines)
}

/**
 * ＋（お客さんの流れに合わせたもの）: 今のオーダーの会計が済んでいたら、そのオーダーを閉じてから
 * 次のお客さんのオーダーを始める。済んでいなければ addItem と同じ
 */
export function addItemForCustomer(config: TallyConfig, state: TallyState, itemId: string, now: Date): TallyState {
  const open = openOrder(state, now)
  const base = open && isPaid(config, state, open) ? closeOrder(state, open.id, now) : state
  return addItem(base, itemId, now)
}
