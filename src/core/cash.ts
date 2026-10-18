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

/** 額面 → 枚数。額面は文字列のキーにする（JSON にそのまま保存できるように）。入れていない額面は持たない */
export type CoinCounts = Record<string, number>

/** レジ精算で数えた枚数 */
export type CashCount = {
  /** 売上のポケットの枚数（お札と硬貨） */
  pocket: CoinCounts
  /** 硬貨の釣り銭準備金の、開店時の枚数（端末が覚える。リセットしても残す） */
  floatStart: CoinCounts
  /** 硬貨の釣り銭準備金の、いまの枚数 */
  floatNow: CoinCounts
}

export type CashField = keyof CashCount

export function emptyCashCount(): CashCount {
  return { pocket: {}, floatStart: {}, floatNow: {} }
}

/** 枚数から金額を出す */
export function countsAmount(counts: CoinCounts): number {
  return Object.entries(counts).reduce((sum, [d, n]) => sum + Number(d) * n, 0)
}

/** 1つの欄を書き換える。null で空欄に戻す。0 以上の整数でない値は受け付けない（例外） */
export function setCashCount(count: CashCount, field: CashField, denomination: number, value: number | null): CashCount {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`0 以上の整数ではありません: ${value}`)
  const counts = { ...count[field] }
  if (value === null) delete counts[String(denomination)]
  else counts[String(denomination)] = value
  return { ...count, [field]: counts }
}

/** ［使っていない］: いまの準備金の枚数を、開店時と同じにする */
export function floatUnused(count: CashCount): CashCount {
  return { ...count, floatNow: { ...count.floatStart } }
}

/** ［数え直す］・リセット: ポケットといまの準備金の枚数を消す。開店時の準備金の枚数は残す（毎日同じことが多いため） */
export function clearCashCount(count: CashCount): CashCount {
  return { pocket: {}, floatStart: count.floatStart, floatNow: {} }
}

export type Settlement = {
  pocket: number
  floatStart: number
  floatNow: number
  /** 使った釣り銭（開店時 − いま）。わからないときは 0 */
  floatUsed: number
  /** お金から出した売上（ポケット − 使った釣り銭） */
  sales: number
  /** ポケットの枚数をどれか入れたか */
  counted: boolean
  /**
   * 準備金の知らせ。noNow: いまの枚数を数えていない（使った分を 0 として計算）、
   * noStart: 開店時の枚数がない、grew: いまのほうが多い（売上の硬貨が混ざっていないか）
   */
  floatProblem: 'noNow' | 'noStart' | 'grew' | null
}

export function settle(count: CashCount): Settlement {
  const pocket = countsAmount(count.pocket)
  const floatStart = countsAmount(count.floatStart)
  const floatNow = countsAmount(count.floatNow)
  let floatUsed = 0
  let floatProblem: Settlement['floatProblem'] = null
  if (Object.keys(count.floatNow).length === 0) floatProblem = floatStart > 0 ? 'noNow' : null
  else if (floatStart === 0 && floatNow > 0) floatProblem = 'noStart'
  else if (floatNow > floatStart) floatProblem = 'grew'
  else floatUsed = floatStart - floatNow
  return { pocket, floatStart, floatNow, floatUsed, sales: pocket - floatUsed, counted: Object.keys(count.pocket).length > 0, floatProblem }
}

export type CashComparison =
  /** まだ数えていない */
  | { kind: 'none' }
  | { kind: 'match' }
  /** お金のほうが多い（押し忘れ・入れ忘れ？） */
  | { kind: 'over'; amount: number }
  /** お金のほうが少ない（押しまちがい・お釣りのまちがい？） */
  | { kind: 'under'; amount: number }

/** お金から出した売上を、数えた売上（注文・在庫から出した売上）と比べる */
export function compareCash(settlement: Settlement, expected: number): CashComparison {
  if (!settlement.counted) return { kind: 'none' }
  const diff = settlement.sales - expected
  if (diff === 0) return { kind: 'match' }
  return diff > 0 ? { kind: 'over', amount: diff } : { kind: 'under', amount: -diff }
}

/** 差と同じ単価の品目の名前（「ソフト 1つ分と同じ額」と添えるため）。重なる名前は1つにする */
export function sameAmountNames(amount: number, items: readonly { name: string; price: number }[]): string[] {
  return [...new Set(items.filter((i) => i.price === amount).map((i) => i.name))]
}

/** 保存されていた枚数を戻す。設定にない額面・0 以上の整数でない枚数は捨てる */
export function parseCashCount(raw: unknown, cash: CashConfig): CashCount {
  const count = emptyCashCount()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return count
  const record = raw as Record<string, unknown>
  const pick = (value: unknown, allowed: number[]): CoinCounts => {
    const counts: CoinCounts = {}
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return counts
    for (const d of allowed) {
      const n = (value as Record<string, unknown>)[String(d)]
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0) counts[String(d)] = n
    }
    return counts
  }
  count.pocket = pick(record.pocket, denominations(cash))
  count.floatStart = pick(record.floatStart, cash.coins)
  count.floatNow = pick(record.floatNow, cash.coins)
  return count
}
