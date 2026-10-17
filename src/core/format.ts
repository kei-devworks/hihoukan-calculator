const numberFormat = new Intl.NumberFormat('ja-JP')

/** 3桁区切りの数字「1,234」（円記号はつけない） */
export function formatNumber(n: number): string {
  return numberFormat.format(n)
}

/** 報告文の金額表記「￥1,234-」 */
export function formatYen(n: number): string {
  return `￥${formatNumber(n)}-`
}

/** 画面の中の金額「￥1,234」（報告文と違い、最後の「-」をつけない） */
export function formatPrice(n: number): string {
  return `￥${formatNumber(n)}`
}
