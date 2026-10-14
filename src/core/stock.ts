/**
 * 「在庫の差」で売上を出すページの、記録と計算（DOM に触れない）。
 * 開店時に在庫を記録し、途中で足した分も記録して、あとで残数を数え直すと
 * 「売れた数 = 開店時 + 追加 − 残数」と、その売上（売れた数 × 単価）が出る（docs/architecture.md）
 */

import { allItems, defaultPrice, type Catalog, type CatalogItem, type CatalogSection } from './catalog'
import { isCount, isDateString, isRecord } from './guards'
import { earlierBusinessDay } from './time'

/** 品目・単価・見出しの設定。見出し（弓道・手裏剣など）ごとに売上を分けて出す */
export type StockConfig = Catalog

/** 品目ごとの記録。まだ入れていない欄は null（0 とは区別する） */
export type StockEntry = {
  /** 開店時の在庫 */
  start: number | null
  /** 途中で足した在庫。何回かに分けて足したときは合計 */
  added: number | null
  /** 数え直したときの残数 */
  remaining: number | null
}

export type StockField = keyof StockEntry

export const STOCK_FIELDS: StockField[] = ['start', 'added', 'remaining']

export type StockState = {
  /** 品目 id → 記録（どれか1つでも入っている品目だけ持つ） */
  entries: Record<string, StockEntry>
  /** 最後に記録を変えた時刻（ISO 8601）。記録がなければ null */
  updatedAt: string | null
  /** いまの記録を入れ始めた時刻（ISO 8601）。前の営業日の記録が残っているかの判定に使う */
  startedAt: string | null
}

const emptyEntry: StockEntry = { start: null, added: null, remaining: null }

export function initialStockState(): StockState {
  return { entries: {}, updatedAt: null, startedAt: null }
}

export function entryOf(state: StockState, itemId: string): StockEntry {
  return state.entries[itemId] ?? emptyEntry
}

function isEmptyEntry(entry: StockEntry): boolean {
  return entry.start === null && entry.added === null && entry.remaining === null
}

export function hasEntries(state: StockState): boolean {
  return Object.keys(state.entries).length > 0
}

/** 1つの欄を書き換える。null で空欄に戻す。0 以上の整数でない値は受け付けない（例外） */
export function setField(
  state: StockState,
  itemId: string,
  field: StockField,
  value: number | null,
  now: Date,
): StockState {
  if (value !== null && !isCount(value)) throw new Error(`0 以上の整数ではありません: ${value}`)
  const entry = { ...entryOf(state, itemId), [field]: value }
  const entries = { ...state.entries }
  if (isEmptyEntry(entry)) delete entries[itemId]
  else entries[itemId] = entry
  const empty = Object.keys(entries).length === 0
  return {
    entries,
    updatedAt: empty ? null : now.toISOString(),
    startedAt: empty ? null : (state.startedAt ?? now.toISOString()),
  }
}

/** 全部消す */
export function resetStock(): StockState {
  return initialStockState()
}

/**
 * 前の日の残数を、今日の開店時の在庫にする（追加と残数は空に戻す）。
 * 残数を入れていない品目は、在庫が分からないので空にする
 */
export function carryRemainingToStart(state: StockState, now: Date): StockState {
  const entries: Record<string, StockEntry> = {}
  for (const [id, entry] of Object.entries(state.entries)) {
    if (entry.remaining !== null) entries[id] = { start: entry.remaining, added: null, remaining: null }
  }
  const empty = Object.keys(entries).length === 0
  return {
    entries,
    updatedAt: empty ? null : now.toISOString(),
    startedAt: empty ? null : now.toISOString(),
  }
}

/** 品目ごとの計算結果 */
export type ItemResult =
  /** 何も入れていない */
  | { status: 'empty' }
  /** 追加や残数はあるが、開店時の在庫がない */
  | { status: 'needStart' }
  /** 残数をまだ数えていない。stock = 開店時 + 追加 */
  | { status: 'needRemaining'; stock: number }
  /** 残数が在庫より多い（入れまちがい） */
  | { status: 'tooMany'; stock: number; remaining: number }
  | { status: 'ok'; stock: number; sold: number; amount: number }

export function itemResult(config: StockConfig, state: StockState, item: CatalogItem): ItemResult {
  const { start, added, remaining } = entryOf(state, item.id)
  if (start === null && added === null && remaining === null) return { status: 'empty' }
  if (start === null) return { status: 'needStart' }
  const stock = start + (added ?? 0)
  if (remaining === null) return { status: 'needRemaining', stock }
  if (remaining > stock) return { status: 'tooMany', stock, remaining }
  const sold = stock - remaining
  return { status: 'ok', stock, sold, amount: sold * defaultPrice(config, item.priceId) }
}

export type SectionResult = {
  /** 計算できた品目の売上の合計 */
  amount: number
  /** 品目ごとの売れた数（計算できた品目だけ） */
  sold: { item: CatalogItem; sold: number }[]
  /** 入れかけで、まだ計算できない品目の数（開店時か残数が未入力） */
  pending: number
  /** 残数が在庫より多い品目の数 */
  problems: number
}

export function sectionResult(config: StockConfig, state: StockState, section: CatalogSection): SectionResult {
  const result: SectionResult = { amount: 0, sold: [], pending: 0, problems: 0 }
  for (const item of section.items) {
    const r = itemResult(config, state, item)
    if (r.status === 'ok') {
      result.amount += r.amount
      result.sold.push({ item, sold: r.sold })
    } else if (r.status === 'tooMany') {
      result.problems++
    } else if (r.status !== 'empty') {
      result.pending++
    }
  }
  return result
}

export function grandStockTotal(config: StockConfig, state: StockState): number {
  return config.sections.reduce((sum, section) => sum + sectionResult(config, state, section).amount, 0)
}

/** 前の営業日に入れ始めた記録が残っていれば、入れ始めた時刻を返す。なければ null */
export function stockCarriedOverSince(config: StockConfig, state: StockState, now: Date): Date | null {
  return hasEntries(state) ? earlierBusinessDay(state.startedAt, config.dayStartHour, now) : null
}

/**
 * 保存されていた値を StockState に戻す。壊れた値・設定にない品目・負の数などは捨てる。
 * 何が来ても例外にはしない（保存が壊れていても画面は開けるように）
 */
export function parseStockState(config: StockConfig, raw: unknown): StockState {
  const state = initialStockState()
  if (!isRecord(raw) || !isRecord(raw.entries)) return state

  for (const item of allItems(config)) {
    const saved = raw.entries[item.id]
    if (!isRecord(saved)) continue
    const entry: StockEntry = { ...emptyEntry }
    for (const field of STOCK_FIELDS) {
      const v = saved[field]
      if (isCount(v)) entry[field] = v
    }
    if (!isEmptyEntry(entry)) state.entries[item.id] = entry
  }
  if (hasEntries(state)) {
    state.updatedAt = isDateString(raw.updatedAt) ? raw.updatedAt : null
    state.startedAt = isDateString(raw.startedAt) ? raw.startedAt : state.updatedAt
  }
  return state
}
