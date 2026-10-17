/**
 * 品目・単価・見出しの設定（カタログ）。売上を数えるページに共通する形で、
 * 「個数 × 単価」（tally.ts）と「在庫の差」（stock.ts）の両方がこれを土台にする（docs/architecture.md）
 */

import { validateCash, type CashConfig } from './cash'
import { isCount } from './guards'

/** 品目。画面の1行 */
export type CatalogItem = {
  /** 保存のキーになる。公開したあとに変えると、その品目の保存済みの数が読めなくなる */
  id: string
  /** 表示名。省略すると単価そのもの（例: 1,000円）を名前にする（値段で呼ぶ串など） */
  name?: string
  /** 使う単価の id。複数の品目で1つの単価を共有できる（ソフトクリームの味違いなど） */
  priceId: string
}

export type CatalogSection = {
  /** 保存には使わない。画面の要素と小計の識別に使う */
  id: string
  /** 画面の見出し（例: '◾️肉'、'弓道'） */
  title: string
  items: CatalogItem[]
}

export type PriceDef = {
  /** 保存のキーになる（画面で単価を変えられるページ）。公開したあとは変えない */
  id: string
  /** 単価設定の欄などに出す名前 */
  label: string
  /** 既定の単価（円）。値上げなどはここを直してデプロイする */
  default: number
}

export type Catalog = {
  /** 保存のキーになる。公開したあとは変えない */
  id: string
  /** ページの題名（タブ・見出し） */
  title: string
  /**
   * 営業日の切り替わる時刻（0〜23時）。前の営業日の数字が残っているときに知らせるのに使う。
   * 4 なら、深夜 3:59 までは前日の営業日として扱う
   */
  dayStartHour: number
  prices: PriceDef[]
  sections: CatalogSection[]
  /** 受け取るお金の額面。書くと、会計（タクミ）とレジ精算の画面を出す */
  cash?: CashConfig
}

export function allItems(catalog: Catalog): CatalogItem[] {
  return catalog.sections.flatMap((s) => s.items)
}

export function defaultPrice(catalog: Catalog, priceId: string): number {
  const def = catalog.prices.find((p) => p.id === priceId)
  if (!def) throw new Error(`単価 ${priceId} が設定にありません`)
  return def.default
}

/** カタログの形をした値か（全ページの設定をテストで拾うのに使う） */
export function looksLikeCatalog(v: unknown): v is Catalog {
  return typeof v === 'object' && v !== null && 'sections' in v && 'prices' in v && 'dayStartHour' in v
}

/**
 * 設定の書き間違いを探す。問題がなければ空の配列。
 * 全ページの設定をテストで確かめる（src/pages/registry.test.ts）
 */
export function validateCatalog(catalog: Catalog): string[] {
  const errors: string[] = []
  const idPattern = /^[a-z0-9-]+$/

  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i)

  if (!idPattern.test(catalog.id)) errors.push(`ページの id「${catalog.id}」に使えない文字があります`)
  if (!Number.isInteger(catalog.dayStartHour) || catalog.dayStartHour < 0 || catalog.dayStartHour > 23) {
    errors.push(`dayStartHour は 0〜23 の整数にしてください（${catalog.dayStartHour}）`)
  }

  const priceIds = catalog.prices.map((p) => p.id)
  for (const id of dupes(priceIds)) errors.push(`単価の id「${id}」が重複しています`)
  for (const p of catalog.prices) {
    if (!idPattern.test(p.id)) errors.push(`単価の id「${p.id}」に使えない文字があります`)
    if (p.id.startsWith('x-')) errors.push(`単価の id「${p.id}」は x- で始めないでください（画面で足した品目に使う）`)
    if (!isCount(p.default)) errors.push(`単価「${p.id}」の既定値は 0 以上の整数にしてください`)
  }

  for (const id of dupes(catalog.sections.map((s) => s.id))) errors.push(`見出しの id「${id}」が重複しています`)

  const items = allItems(catalog)
  for (const id of dupes(items.map((i) => i.id))) errors.push(`品目の id「${id}」が重複しています`)
  for (const item of items) {
    if (!idPattern.test(item.id)) errors.push(`品目の id「${item.id}」に使えない文字があります`)
    if (item.id.startsWith('x-')) errors.push(`品目の id「${item.id}」は x- で始めないでください（画面で足した品目に使う）`)
    if (!priceIds.includes(item.priceId)) {
      errors.push(`品目「${item.id}」の単価「${item.priceId}」が prices にありません`)
    }
  }

  const used = new Set(items.map((i) => i.priceId))
  for (const id of priceIds) if (!used.has(id)) errors.push(`単価「${id}」はどの品目にも使われていません`)

  if (catalog.cash) errors.push(...validateCash(catalog.cash))

  return errors
}
