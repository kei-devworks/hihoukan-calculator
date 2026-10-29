/**
 * お金の額面の設定（DOM に触れない）。会計の預かりのボタンと、レジ精算の枚数の欄はこの額面から作る
 */

export type CashConfig = {
  /** 受け取るお札の額面（例: [10000, 5000, 1000]） */
  bills: number[]
  /** 受け取る硬貨の額面（例: [500, 100]）。釣り銭準備金の硬貨（コインケース）もこの額面で数える */
  coins: number[]
  /**
   * 釣り銭準備金の束1つの金額（1万円の束なら 10000。1,000円札10枚、または 5,000円札1枚と 1,000円札5枚）。
   * 書くと、釣り銭準備金に束の数の欄を出す（釣り銭準備金の袋）
   */
  bundle?: number
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
  if (cash.bundle !== undefined && (!Number.isInteger(cash.bundle) || cash.bundle <= 0)) {
    errors.push(`束の金額「${cash.bundle}」は 1 以上の整数にしてください`)
  }
  return errors
}

/** 額面 → 枚数。額面は文字列のキーにする（JSON にそのまま保存できるように）。入れていない額面は持たない */
export type CoinCounts = Record<string, number>

/** 釣り銭準備金の数のキーのうち、1万円の束（cash.bundle）の数 */
export const BUNDLE = 'bundle'

/**
 * レジ精算で数えた数。
 * 釣り銭準備金は「釣り銭準備金の袋」（1万円の束）と「コインケース」（硬貨）に入っていて、どちらも売上バッグの中にある。
 * 釣り銭準備金の数は、キーを BUNDLE（束の数）と硬貨の額面にした CoinCounts で持つ
 */
export type CashCount = {
  /** 開店時の釣り銭準備金（端末が覚える。リセットしても残す。毎日同じことが多いため） */
  floatStart: CoinCounts
  /** 釣り銭準備金をお釣りに使ったか。null はまだ選んでいない */
  floatUsed: boolean | null
  /** 売上バッグの枚数（お札と硬貨）。釣り銭準備金の袋・コインケースに入っていないお金 */
  bag: CoinCounts
  /**
   * 使ったときの、釣り銭準備金のいまの数。入れていない欄は開店時のまま
   * （画面は開店時の数から始め、変わったところだけ直してもらう。入れ忘れた硬貨が 0 枚あつかいにならないように）
   */
  floatNow: CoinCounts
}

export type CashField = 'floatStart' | 'bag' | 'floatNow'

export function emptyCashCount(): CashCount {
  return { floatStart: {}, floatUsed: null, bag: {}, floatNow: {} }
}

/** 釣り銭準備金の数のキー（束があれば束、硬貨は大きい順）。画面の並び */
export function floatKeys(cash: CashConfig): string[] {
  return [...(cash.bundle ? [BUNDLE] : []), ...[...cash.coins].sort((a, b) => b - a).map(String)]
}

/** 枚数から金額を出す。BUNDLE は束1つの金額（cash.bundle）で数える */
export function countsAmount(counts: CoinCounts, cash?: CashConfig): number {
  return Object.entries(counts).reduce((sum, [key, n]) => sum + (key === BUNDLE ? (cash?.bundle ?? 0) : Number(key)) * n, 0)
}

/** 使ったときの、釣り銭準備金のいまの数（入れていない欄は開店時の数） */
export function floatNowOf(count: CashCount, key: string): number {
  return count.floatNow[key] ?? count.floatStart[key] ?? 0
}

/**
 * 1つの欄を書き換える。key は額面か BUNDLE。null で空欄に戻す（いまの釣り銭準備金は開店時のままに戻る）。
 * 0 以上の整数でない値は受け付けない（例外）
 */
export function setCashCount(count: CashCount, field: CashField, key: number | string, value: number | null): CashCount {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`0 以上の整数ではありません: ${value}`)
  const counts = { ...count[field] }
  if (value === null) delete counts[String(key)]
  else counts[String(key)] = value
  return { ...count, [field]: counts }
}

/** ① 釣り銭準備金をお釣りに使ったか */
export function setFloatUsed(count: CashCount, used: boolean): CashCount {
  return { ...count, floatUsed: used }
}

/** リセット: 開店時の釣り銭準備金だけ残し、ほかは消す */
export function clearCashCount(count: CashCount): CashCount {
  return { ...emptyCashCount(), floatStart: count.floatStart }
}

export type Settlement = {
  floatUsed: boolean | null
  /** 開店時の釣り銭準備金の合計 */
  floatStart: number
  /** 釣り銭準備金のいまの合計（使ったとき。入れていない欄は開店時のまま）。使っていないときは開店時と同じ */
  floatNow: number
  /** 売上バッグの合計 */
  bag: number
  /** 数えたお金の合計。使ったとき: 釣り銭準備金のいま ＋ 売上バッグ、使っていないとき: 売上バッグ */
  total: number
  /** お金から出した売上。使ったとき: 数えたお金の合計 − 開店時の釣り銭準備金、使っていないとき: 売上バッグ */
  sales: number
  /** 使ったかを選び、売上バッグの枚数をどれか入れたか */
  counted: boolean
  /** 使ったとき、釣り銭準備金で開店時から変わったところ（画面の並び） */
  changed: { key: string; from: number; to: number }[]
}

export function settle(count: CashCount, cash: CashConfig): Settlement {
  const floatStart = countsAmount(count.floatStart, cash)
  const bag = countsAmount(count.bag, cash)
  const used = count.floatUsed === true
  const changed = used
    ? floatKeys(cash)
        .map((key) => ({ key, from: count.floatStart[key] ?? 0, to: floatNowOf(count, key) }))
        .filter((c) => c.from !== c.to)
    : []
  const floatNow = used ? floatKeys(cash).reduce((sum, key) => sum + countsAmount({ [key]: floatNowOf(count, key) }, cash), 0) : floatStart
  const total = used ? floatNow + bag : bag
  return {
    floatUsed: count.floatUsed,
    floatStart,
    floatNow,
    bag,
    total,
    sales: used ? total - floatStart : bag,
    counted: count.floatUsed !== null && Object.keys(count.bag).length > 0,
    changed,
  }
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

/**
 * 保存されていた数を戻す。設定にない額面・0 以上の整数でない枚数は捨てる。
 * 前の形（売上のポケット pocket と、硬貨の釣り銭準備金の開店時 floatStart・いま floatNow）は、
 * ポケットを売上バッグとして読み、いまを数えていたら「使った」にする
 */
export function parseCashCount(raw: unknown, cash: CashConfig): CashCount {
  const count = emptyCashCount()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return count
  const record = raw as Record<string, unknown>
  const pick = (value: unknown, allowed: string[]): CoinCounts => {
    const counts: CoinCounts = {}
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return counts
    for (const key of allowed) {
      const n = (value as Record<string, unknown>)[key]
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0) counts[key] = n
    }
    return counts
  }
  const money = denominations(cash).map(String)
  count.floatStart = pick(record.floatStart, floatKeys(cash))
  count.floatNow = pick(record.floatNow, floatKeys(cash))
  if ('bag' in record || !('pocket' in record)) {
    count.bag = pick(record.bag, money)
    count.floatUsed = typeof record.floatUsed === 'boolean' ? record.floatUsed : null
  } else {
    count.bag = pick(record.pocket, money)
    count.floatUsed = Object.keys(count.floatNow).length > 0 ? true : null
  }
  return count
}
