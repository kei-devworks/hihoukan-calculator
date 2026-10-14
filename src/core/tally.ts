/**
 * 「個数 × 単価」で売上を数えるページの、設定と計算（DOM に触れない）。
 * 品目・単価・見出しは TallyConfig に書き、画面・保存・報告文はすべて設定から作る（docs/architecture.md）
 */

import { allItems, defaultPrice, validateCatalog, type Catalog, type CatalogItem, type CatalogSection } from './catalog'
import { formatNumber } from './format'
import { isCount, isDateString, isRecord } from './guards'
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
  counts: Counts
  /** 既定から変えた単価だけを持つ（既定のままのものは持たない） */
  priceOverrides: Prices
  /** 最後に個数を変えた時刻（ISO 8601）。数えていなければ null */
  updatedAt: string | null
  /**
   * いまの数字を数え始めた時刻（ISO 8601）。0 から数え始めたときに記録し、全部 0 に戻ると消える。
   * 前の営業日の数字が残っているかの判定に使う（更新時刻で判定すると、残った数字に今日の分を
   * 1つ足しただけで「今日の数字」に見えてしまうため）
   */
  startedAt: string | null
}

export function initialState(): TallyState {
  return { counts: {}, priceOverrides: {}, updatedAt: null, startedAt: null }
}

export function countOf(state: TallyState, itemId: string): number {
  return state.counts[itemId] ?? 0
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

export function hasCounts(state: TallyState): boolean {
  return Object.values(state.counts).some((n) => n > 0)
}

/** 個数を増減する。0 より下にはならない */
export function bump(state: TallyState, itemId: string, delta: number, now: Date): TallyState {
  const next = Math.max(0, countOf(state, itemId) + delta)
  const counts = { ...state.counts }
  if (next === 0) delete counts[itemId]
  else counts[itemId] = next
  const empty = Object.keys(counts).length === 0
  return {
    ...state,
    counts,
    updatedAt: now.toISOString(),
    startedAt: empty ? null : (state.startedAt ?? now.toISOString()),
  }
}

/** 個数をすべて 0 に戻す。単価の変更は残す */
export function resetCounts(state: TallyState): TallyState {
  return { ...state, counts: {}, updatedAt: null, startedAt: null }
}

/**
 * 前の営業日に数え始めた数字が残っていれば、数え始めた時刻を返す。なければ null。
 * 営業日は config.dayStartHour で区切る（深夜営業の途中で「前日の数字」扱いにしないため）
 */
export function carriedOverSince(config: TallyConfig, state: TallyState, now: Date): Date | null {
  return hasCounts(state) ? earlierBusinessDay(state.startedAt, config.dayStartHour, now) : null
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

  if (isRecord(raw.counts)) {
    for (const item of allItems(config)) {
      const n = raw.counts[item.id]
      if (isCount(n) && n > 0) state.counts[item.id] = n
    }
  }
  if (isRecord(raw.priceOverrides)) {
    for (const def of config.prices) {
      const p = raw.priceOverrides[def.id]
      if (isCount(p) && p !== def.default) state.priceOverrides[def.id] = p
    }
  }
  if (hasCounts(state)) {
    state.updatedAt = isDateString(raw.updatedAt) ? raw.updatedAt : null
    state.startedAt = isDateString(raw.startedAt) ? raw.startedAt : state.updatedAt
  }
  return state
}

/** 設定の書き間違いを探す。問題がなければ空の配列 */
export function validateConfig(config: TallyConfig): string[] {
  return validateCatalog(config)
}
