/**
 * 会計の預かりとお釣り（DOM に触れない）。預かりは押した額面の並び（Order.tenders）で持つ
 */

import { formatPriceEn } from './format'
import { addItem, closeOrder, openOrder, type Order, type OrderLines } from './orders'
import type { ReceiptGenre } from './receipt'
import { displayName, linesTotal, priceOf, sectionsOf, type TallyConfig, type TallyState } from './tally'

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

/** レシートの1行（品目） */
export type ReceiptLine = {
  itemId: string
  /** 英語名。値段で呼ぶ品目は値段（「¥1,000」）、ジャンルに入らない名前のある品目は日本語名 */
  en: string
  /** 小さく添える日本語名。値段で呼ぶ品目と、ジャンルに入らない品目は null */
  ja: string | null
  count: number
  amount: number
}

/** レシートのジャンル。品目はジャンル名の下に並べる */
export type ReceiptGroup = {
  en: string
  /** 小さく添える日本語名。ジャンルに入らない品目は null */
  ja: string | null
  /** 1品だけのジャンル（と、ジャンルに入らない品目）。ジャンル名の行に数と金額を出す */
  single: boolean
  lines: ReceiptLine[]
}

/**
 * 会計の画面のレシートに出す品目を、設定のジャンル（receipt）にまとめる。
 * ジャンルは、その品目が最初に出てくる順（品目の画面と同じ並び）。ジャンルに入らない品目は、その品目だけで1行
 */
export function receiptGroups(config: TallyConfig, state: TallyState, lines: OrderLines): ReceiptGroup[] {
  const genres = config.receipt ?? []
  const groups = new Map<ReceiptGenre | string, ReceiptGroup>()
  for (const section of sectionsOf(config, state)) {
    for (const item of section.items) {
      const count = lines[item.id] ?? 0
      if (count === 0) continue
      const price = priceOf(config, state, item.priceId)
      const line = { itemId: item.id, count, amount: count * price }
      const genre =
        genres.find((g) => ('item' in g ? g.item === item.id : 'items' in g && item.id in g.items)) ??
        (item.name === undefined
          ? genres.find((g) => 'section' in g && g.section === section.id && g.minPrice <= price && price <= g.maxPrice)
          : undefined)
      if (!genre) {
        const en = item.name === undefined ? formatPriceEn(price) : displayName(config, state, item)
        groups.set(item.id, { en, ja: null, single: true, lines: [{ ...line, en, ja: null }] })
        continue
      }
      const group = groups.get(genre) ?? { en: genre.en, ja: genre.ja, single: 'item' in genre, lines: [] }
      groups.set(genre, group)
      if ('items' in genre) group.lines.push({ ...line, en: genre.items[item.id]!, ja: item.name ?? null })
      else if ('item' in genre) group.lines.push({ ...line, en: genre.en, ja: genre.ja })
      else group.lines.push({ ...line, en: formatPriceEn(price), ja: null })
    }
  }
  return [...groups.values()]
}
