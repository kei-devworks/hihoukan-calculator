/**
 * お金の額面の設定（DOM に触れない）。会計の預かりのボタンと、レジ精算の枚数の欄はこの額面から作る
 */

export type CashConfig = {
  /** 受け取るお札の額面（例: [10000, 5000, 1000]） */
  bills: number[]
  /** 受け取る硬貨の額面（例: [500, 100]）。硬貨の釣り銭準備金もこの額面で数える */
  coins: number[]
}

/** お札と硬貨の額面を、大きい順に */
export function denominations(cash: CashConfig): number[] {
  return [...cash.bills, ...cash.coins].sort((a, b) => b - a)
}

/** 額面の設定の書き間違いを探す。問題がなければ空の配列 */
export function validateCash(cash: CashConfig): string[] {
  const errors: string[] = []
  const all = [...cash.bills, ...cash.coins]
  if (cash.bills.length === 0 && cash.coins.length === 0) errors.push('cash に額面がありません')
  for (const d of all) if (!Number.isInteger(d) || d <= 0) errors.push(`額面「${d}」は 1 以上の整数にしてください`)
  for (const d of all.filter((d, i) => all.indexOf(d) !== i)) errors.push(`額面「${d}」が重複しています`)
  return errors
}
