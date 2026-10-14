/**
 * 「個数 × 単価」で売上を数えるページの、設定と計算（DOM に触れない）。
 * 品目・単価・見出しは TallyConfig に書き、画面・保存・報告文はすべて設定から作る（docs/architecture.md）
 */

import { formatNumber } from './format'
import { businessDate } from './time'

/** 品目。1品目 = 画面の1行（＋/− のカウンター） */
export type TallyItem = {
  /** 保存のキーになる。公開したあとに変えると、その品目の保存済みの数が読めなくなる */
  id: string
  /** 表示名。省略すると単価そのもの（例: 1,000）を名前にする（値段で呼ぶ串など） */
  name?: string
  /** 使う単価の id。ソフトクリームの味違いのように、複数の品目で1つの単価を共有できる */
  priceId: string
}

export type TallySection = {
  /** 保存には使わない。画面の要素の id と小計の識別に使う */
  id: string
  /** 画面と報告文の見出し（例: '◾️肉'） */
  title: string
  items: TallyItem[]
}

export type PriceDef = {
  /** 保存のキーになる。公開したあとに変えると、画面で変えた単価が既定に戻る */
  id: string
  /** 単価設定の欄に出す名前 */
  label: string
  /** 既定の単価（円）。値上げなどはここを直してデプロイする */
  default: number
}

export type TallyConfig = {
  /** 保存のキーになる。公開したあとは変えない */
  id: string
  /** ページの題名（タブ・見出し） */
  title: string
  /** 報告文の1行目 */
  reportTitle: string
  /**
   * 営業日の切り替わる時刻（0〜23時）。前の営業日の数字が残っているときに知らせるのに使う。
   * 4 なら、深夜 3:59 までは前日の営業日として扱う
   */
  dayStartHour: number
  prices: PriceDef[]
  sections: TallySection[]
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

export function allItems(config: TallyConfig): TallyItem[] {
  return config.sections.flatMap((s) => s.items)
}

export function initialState(): TallyState {
  return { counts: {}, priceOverrides: {}, updatedAt: null, startedAt: null }
}

export function countOf(state: TallyState, itemId: string): number {
  return state.counts[itemId] ?? 0
}

export function priceOf(config: TallyConfig, state: TallyState, priceId: string): number {
  const override = state.priceOverrides[priceId]
  if (override !== undefined) return override
  const def = config.prices.find((p) => p.id === priceId)
  if (!def) throw new Error(`単価 ${priceId} が設定にありません`)
  return def.default
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
  if (!state.startedAt || !hasCounts(state)) return null
  const started = new Date(state.startedAt)
  return businessDate(started, config.dayStartHour) === businessDate(now, config.dayStartHour) ? null : started
}

/** 単価を変える。既定と同じ値なら、変更なしの扱いに戻す。不正な値は 0 にする */
export function setPrice(config: TallyConfig, state: TallyState, priceId: string, value: number): TallyState {
  const def = config.prices.find((p) => p.id === priceId)
  if (!def) throw new Error(`単価 ${priceId} が設定にありません`)
  const price = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  const priceOverrides = { ...state.priceOverrides }
  if (price === def.default) delete priceOverrides[priceId]
  else priceOverrides[priceId] = price
  return { ...state, priceOverrides }
}

export function resetPrices(state: TallyState): TallyState {
  return { ...state, priceOverrides: {} }
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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

function isDateString(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

/**
 * 設定の書き間違いを探す。問題がなければ空の配列。
 * 全ページの設定をテストで確かめる（src/pages/registry.test.ts）
 */
export function validateConfig(config: TallyConfig): string[] {
  const errors: string[] = []
  const idPattern = /^[a-z0-9-]+$/

  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i)

  if (!idPattern.test(config.id)) errors.push(`ページの id「${config.id}」に使えない文字があります`)
  if (!Number.isInteger(config.dayStartHour) || config.dayStartHour < 0 || config.dayStartHour > 23) {
    errors.push(`dayStartHour は 0〜23 の整数にしてください（${config.dayStartHour}）`)
  }

  const priceIds = config.prices.map((p) => p.id)
  for (const id of dupes(priceIds)) errors.push(`単価の id「${id}」が重複しています`)
  for (const p of config.prices) {
    if (!idPattern.test(p.id)) errors.push(`単価の id「${p.id}」に使えない文字があります`)
    if (!isCount(p.default)) errors.push(`単価「${p.id}」の既定値は 0 以上の整数にしてください`)
  }

  for (const id of dupes(config.sections.map((s) => s.id))) errors.push(`見出しの id「${id}」が重複しています`)

  const items = allItems(config)
  for (const id of dupes(items.map((i) => i.id))) errors.push(`品目の id「${id}」が重複しています`)
  for (const item of items) {
    if (!idPattern.test(item.id)) errors.push(`品目の id「${item.id}」に使えない文字があります`)
    if (!priceIds.includes(item.priceId)) {
      errors.push(`品目「${item.id}」の単価「${item.priceId}」が prices にありません`)
    }
  }

  const used = new Set(items.map((i) => i.priceId))
  for (const id of priceIds) if (!used.has(id)) errors.push(`単価「${id}」はどの品目にも使われていません`)

  return errors
}
