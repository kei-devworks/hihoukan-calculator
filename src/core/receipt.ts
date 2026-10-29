/**
 * 会計の画面のレシート（お客様に見せる）に出すジャンルの設定と、その書き間違いの確かめ（DOM に触れない）。
 * お客様の多くが海外の方なので、品目をジャンル（Wagyu A5・Cremia Soft Serve など）にまとめ、英語名を先に出す。
 * 品目をジャンルに分けるのは core/checkout.ts の receiptGroups
 */

import type { Catalog } from './catalog'

/** ジャンル。英語名を大きく、日本語名を小さく添える */
export type ReceiptGenre = {
  /** 英語名。例: 'Wagyu A5' */
  en: string
  /** 日本語名。例: 'A5和牛' */
  ja: string
} & (
  | {
      /** 1品だけのジャンル（ホタテ → Scallop）。ジャンル名の行に数と金額を出す */
      item: string
    }
  | {
      /** 名前のある品目（品目 id → 英語名）。味違いのソフトクリームなど。品目はジャンル名の下に並べる */
      items: Record<string, string>
    }
  | {
      /**
       * 値段で呼ぶ品目（名前のない品目）のうち、この見出しで、この値段の範囲のもの（両端を含む）。
       * 品目はジャンル名の下に値段（「¥1,000」）で並べる。画面から足した値段だけの品目にも効く
       */
      section: string
      minPrice: number
      maxPrice: number
    }
)

/** 設定の書き間違いを探す。問題がなければ空の配列（validateCatalog から呼ぶ） */
export function validateReceipt(catalog: Catalog, genres: readonly ReceiptGenre[]): string[] {
  const errors: string[] = []
  const items = catalog.sections.flatMap((s) => s.items)
  const itemIds = new Set(items.map((i) => i.id))
  const listed: string[] = []
  const ranges: { section: string; min: number; max: number; en: string }[] = []

  for (const genre of genres) {
    const name = genre.en || genre.ja || '（名前なし）'
    if (genre.en.trim() === '') errors.push(`ジャンル「${name}」の英語名（en）が空です`)
    if (genre.ja.trim() === '') errors.push(`ジャンル「${name}」の日本語名（ja）が空です`)
    if ('item' in genre) {
      if (!itemIds.has(genre.item)) errors.push(`ジャンル「${name}」の品目「${genre.item}」がありません`)
      listed.push(genre.item)
    } else if ('items' in genre) {
      for (const [id, en] of Object.entries(genre.items)) {
        if (!itemIds.has(id)) errors.push(`ジャンル「${name}」の品目「${id}」がありません`)
        if (en.trim() === '') errors.push(`ジャンル「${name}」の品目「${id}」の英語名が空です`)
        listed.push(id)
      }
    } else {
      if (!catalog.sections.some((s) => s.id === genre.section)) errors.push(`ジャンル「${name}」の見出し「${genre.section}」がありません`)
      const ok = (n: number) => Number.isInteger(n) && n > 0
      if (!ok(genre.minPrice) || !ok(genre.maxPrice) || genre.minPrice > genre.maxPrice) {
        errors.push(`ジャンル「${name}」の値段の範囲は、1 以上の整数で minPrice ≤ maxPrice にしてください`)
      }
      for (const r of ranges) {
        if (r.section === genre.section && genre.minPrice <= r.max && r.min <= genre.maxPrice) {
          errors.push(`ジャンル「${name}」と「${r.en}」の値段の範囲が重なっています`)
        }
      }
      ranges.push({ section: genre.section, min: genre.minPrice, max: genre.maxPrice, en: name })
    }
  }
  for (const id of listed.filter((id, i) => listed.indexOf(id) !== i)) errors.push(`品目「${id}」が2つのジャンルに入っています`)
  return errors
}
