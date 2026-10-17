/**
 * 「個数 × 単価」で売上を数えるページの、設定と計算（DOM に触れない）。
 * 品目・単価・見出しは TallyConfig に書き、画面・保存・報告文はすべて設定から作る（docs/architecture.md）
 */

import { clearCashCount, emptyCashCount, parseCashCount, type CashCount } from './cash'
import { allItems, defaultPrice, validateCatalog, type Catalog, type CatalogItem, type CatalogSection } from './catalog'
import { formatNumber } from './format'
import { isCount, isDateString, isRecord } from './guards'
import { liveOrders, pieces, type Order, type OrderEdit, type OrderLines } from './orders'
import { earlierBusinessDay } from './time'

export { allItems } from './catalog'
export type { PriceDef } from './catalog'

/** 品目。1品目 = 画面の1行（＋/− のカウンター） */
export type TallyItem = CatalogItem
export type TallySection = CatalogSection

export type TallyConfig = Catalog & {
  /** 報告文の1行目 */
  reportTitle: string
}

/** 品目 id → 個数 */
export type Counts = Record<string, number>
/** 単価 id → 円 */
export type Prices = Record<string, number>

export type TallyState = {
  /** オーダーの記録（古い順）。個数はここから数える（core/orders.ts） */
  orders: Order[]
  /** 既定から変えた単価だけを持つ（既定のままのものは持たない） */
  priceOverrides: Prices
  /** レジ精算で数えた枚数（設定に cash があるページだけ使う） */
  cash: CashCount
  /** 最後に記録を変えた時刻（ISO 8601）。記録がなければ null */
  updatedAt: string | null
}

export function initialState(): TallyState {
  return { orders: [], priceOverrides: {}, cash: emptyCashCount(), updatedAt: null }
}

/** 品目 id → 個数（取り消したオーダーを除く、すべてのオーダーの合計） */
export function countsOf(state: TallyState): Counts {
  const counts: Counts = {}
  for (const order of liveOrders(state)) {
    for (const [id, n] of Object.entries(order.lines)) counts[id] = (counts[id] ?? 0) + n
  }
  return counts
}

export function countOf(state: TallyState, itemId: string): number {
  return countsOf(state)[itemId] ?? 0
}

export function priceOf(config: TallyConfig, state: TallyState, priceId: string): number {
  return state.priceOverrides[priceId] ?? defaultPrice(config, priceId)
}

/** 画面に出す品目名（名前がなければ「1,000円」） */
export function displayName(config: TallyConfig, state: TallyState, item: TallyItem): string {
  return item.name ?? `${formatNumber(priceOf(config, state, item.priceId))}円`
}

/** 報告文に出す品目名（名前がなければ「1,000」） */
export function reportName(config: TallyConfig, state: TallyState, item: TallyItem): string {
  return item.name ?? formatNumber(priceOf(config, state, item.priceId))
}

export function sectionTotal(config: TallyConfig, state: TallyState, section: TallySection): number {
  return section.items.reduce(
    (sum, item) => sum + countOf(state, item.id) * priceOf(config, state, item.priceId),
    0,
  )
}

export function grandTotal(config: TallyConfig, state: TallyState): number {
  return config.sections.reduce((sum, section) => sum + sectionTotal(config, state, section), 0)
}

/** オーダー（の中身）の金額。いまの単価で計算する */
export function linesTotal(config: TallyConfig, state: TallyState, lines: OrderLines): number {
  let sum = 0
  for (const item of allItems(config)) sum += (lines[item.id] ?? 0) * priceOf(config, state, item.priceId)
  return sum
}

export function hasCounts(state: TallyState): boolean {
  return liveOrders(state).some((o) => pieces(o.lines) > 0)
}

/**
 * いまの数字を数え始めた時刻（いちばん古いオーダーの始めた時刻）。記録がなければ null。
 * 前の営業日の数字が残っているかの判定に使う（最後に押した時刻で判定すると、残った数字に今日の分を
 * 1つ足しただけで「今日の数字」に見えてしまうため）
 */
export function startedAtOf(state: TallyState): string | null {
  const opened = liveOrders(state).map((o) => o.openedAt)
  return opened.length === 0 ? null : opened.reduce((min, at) => (Date.parse(at) < Date.parse(min) ? at : min))
}

/** 記録をすべて消して 0 に戻す。レジ精算はポケットといまの枚数を消す。単価の変更と、釣り銭準備金の開店時の枚数は残す */
export function resetCounts(state: TallyState): TallyState {
  return { ...state, orders: [], cash: clearCashCount(state.cash), updatedAt: null }
}

/**
 * 前の営業日に数え始めた数字が残っていれば、数え始めた時刻を返す。なければ null。
 * 営業日は config.dayStartHour で区切る（深夜営業の途中で「前日の数字」扱いにしないため）
 */
export function carriedOverSince(config: TallyConfig, state: TallyState, now: Date): Date | null {
  return hasCounts(state) ? earlierBusinessDay(startedAtOf(state), config.dayStartHour, now) : null
}

/** 単価を変える。既定と同じ値なら、変更なしの扱いに戻す。不正な値は 0 にする */
export function setPrice(config: TallyConfig, state: TallyState, priceId: string, value: number): TallyState {
  const def = defaultPrice(config, priceId)
  const price = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  const priceOverrides = { ...state.priceOverrides }
  if (price === def) delete priceOverrides[priceId]
  else priceOverrides[priceId] = price
  return { ...state, priceOverrides }
}

export function resetPrices(state: TallyState): TallyState {
  return { ...state, priceOverrides: {} }
}

/**
 * 保存されていた値を TallyState に戻す。壊れた値・設定にない品目・負の数などは捨てる。
 * 何が来ても例外にはしない（保存が壊れていても画面は開けるように）
 */
export function parseState(config: TallyConfig, raw: unknown): TallyState {
  const state = initialState()
  if (!isRecord(raw)) return state
  const itemIds = new Set(allItems(config).map((i) => i.id))

  if (Array.isArray(raw.orders)) {
    for (const value of raw.orders) {
      const order = parseOrder(value, itemIds)
      // id は増えていく順に並ぶ。重なり・逆順は壊れた値として捨てる
      if (order && order.id > (state.orders.at(-1)?.id ?? 0)) state.orders.push(order)
    }
  } else if (isRecord(raw.counts)) {
    // 版 1 の保存（品目ごとの個数だけ）。押した時刻はわからないので、1件の「まとめて入れた数」にする
    const lines = parseLines(raw.counts, itemIds)
    if (pieces(lines) > 0) {
      const at = isDateString(raw.startedAt)
        ? raw.startedAt
        : isDateString(raw.updatedAt)
          ? raw.updatedAt
          : new Date(0).toISOString()
      state.orders.push({
        id: 1,
        kind: 'handover',
        openedAt: at,
        lastAt: at,
        closedAt: at,
        lines,
        tenders: [],
        edits: [],
        cancelledAt: null,
        source: '更新前の記録',
      })
    }
  }

  if (isRecord(raw.priceOverrides)) {
    for (const def of config.prices) {
      const p = raw.priceOverrides[def.id]
      if (isCount(p) && p !== def.default) state.priceOverrides[def.id] = p
    }
  }
  // レジ精算の枚数は版 2 のあとから足した項目。なければ空にする
  if (config.cash) state.cash = parseCashCount(raw.cash, config.cash)
  const counted = Object.keys(state.cash.pocket).length > 0 || Object.keys(state.cash.floatNow).length > 0
  if (state.orders.length > 0 || counted) state.updatedAt = isDateString(raw.updatedAt) ? raw.updatedAt : null
  return state
}

/** 品目 id → 数。設定にない品目・0 以下・整数でない数は捨てる */
function parseLines(raw: unknown, itemIds: Set<string>): OrderLines {
  const lines: OrderLines = {}
  if (!isRecord(raw)) return lines
  for (const [id, n] of Object.entries(raw)) if (itemIds.has(id) && isCount(n) && n > 0) lines[id] = n
  return lines
}

const isDateOrNull = (v: unknown): v is string | null => v === null || isDateString(v)

function parseOrder(raw: unknown, itemIds: Set<string>): Order | null {
  if (!isRecord(raw)) return null
  const { id, kind, openedAt, lastAt, closedAt, cancelledAt, source } = raw
  if (!isCount(id) || id === 0 || (kind !== 'order' && kind !== 'handover')) return null
  if (!isDateString(openedAt) || !isDateString(lastAt) || !isDateOrNull(closedAt) || !isDateOrNull(cancelledAt)) return null
  const lines = parseLines(raw.lines, itemIds)
  // 中身が空のオーダーは残さない（設定から品目が消えた場合も含む）
  if (pieces(lines) === 0) return null
  const tenders = Array.isArray(raw.tenders) ? raw.tenders.filter((t): t is number => isCount(t) && t > 0) : []
  const edits: OrderEdit[] = Array.isArray(raw.edits)
    ? raw.edits.flatMap((e) => (isRecord(e) && isDateString(e.at) ? [{ at: e.at, before: parseLines(e.before, itemIds) }] : []))
    : []
  return {
    id,
    kind,
    openedAt,
    lastAt,
    closedAt,
    lines,
    tenders,
    edits,
    cancelledAt,
    source: typeof source === 'string' ? source : null,
  }
}

/** 設定の書き間違いを探す。問題がなければ空の配列 */
export function validateConfig(config: TallyConfig): string[] {
  return validateCatalog(config)
}
