import {
  compareCash,
  denominations,
  sameAmountNames,
  setCashCount,
  settle,
  type CashConfig,
  type CashCount,
  type CashField,
} from '../core/cash'
import { formatNumber, formatPrice } from '../core/format'
import { h } from './dom'
import { holdButton } from './hold-button'
import { numberInput } from './number-input'

export type CashPanelOptions = {
  cash: CashConfig
  /** 要素の id の頭（1つのページに複数置くときに分ける） */
  idPrefix: string
  /** 見出し（省略すると「レジ精算」） */
  title?: string
  /** 欄の読み上げ名の頭（1つのページに複数置くときに分ける。例: '弓道 '） */
  labelPrefix?: string
  /** 比べる相手の名前（「注文から出した売上」「在庫から出した売上」） */
  expectedLabel: string
  /** 差が出たときに添える言葉 */
  hints: { over: string; under: string }
  onChange: (next: CashCount) => void
  /** ［使っていない］ */
  onFloatUnused: () => void
  /** ［数え直す］（長押し）: ポケットといまの準備金の枚数を消す */
  onClear: () => void
}

export type CashPanel = {
  element: HTMLElement
  /** candidates: 差と同じ額の品目を探すための、品目の名前と単価 */
  render: (count: CashCount, expected: number, candidates: readonly { name: string; price: number }[]) => void
}

/** 「1万円札」「5千円札」「千円札」「500円玉」 */
export function denominationName(denomination: number, coin: boolean): string {
  if (coin) return `${formatNumber(denomination)}円玉`
  if (denomination % 10000 === 0) return `${denomination / 10000}万円札`
  if (denomination === 1000) return '千円札'
  if (denomination % 1000 === 0) return `${denomination / 1000}千円札`
  return `${formatNumber(denomination)}円札`
}

/** 入力欄の文字を数に読む。空なら null、0 以上の整数でなければ undefined（受け付けない） */
function readCount(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/**
 * レジ精算の画面: 売上のポケットの枚数、硬貨の釣り銭準備金（開店時・いま）と、計算の筆算。
 * 筆算は「ポケットの合計 − 使った釣り銭 → お金から出した売上 − 数えた売上（expectedLabel）→ 差」と、差まで1本で出す。
 * 囲みの枠は使わず見出しで区切る
 */
export function cashPanel(options: CashPanelOptions): CashPanel {
  const { cash, idPrefix } = options
  const prefix = options.labelPrefix ?? ''
  const coins = new Set(cash.coins)
  type Field = { field: CashField; denomination: number; input: HTMLInputElement }
  const fields: Field[] = []

  const makeInput = (field: CashField, denomination: number, label: string) => {
    const input = numberInput({
      id: `${idPrefix}-${field}-${denomination}`,
      'aria-label': label,
      enterkeyhint: 'next',
    })
    fields.push({ field, denomination, input })
    return input
  }

  // ---- 売上のポケット ----
  const pocketAmounts = new Map<number, HTMLElement>()
  const pocketRows = denominations(cash).flatMap((d) => {
    const name = denominationName(d, coins.has(d))
    const input = makeInput('pocket', d, `${prefix}売上のポケット ${name}の枚数`)
    const amount = h('span', { class: 'cash-yen' })
    pocketAmounts.set(d, amount)
    return [h('label', { for: input.id, text: name }), input, h('span', { class: 'cash-unit', text: '枚' }), amount]
  })
  const pocketTotal = h('b')

  // ---- 硬貨の釣り銭準備金 ----
  const floatRows = cash.coins.flatMap((d) => {
    const name = denominationName(d, true)
    return [
      h('span', { text: name }),
      makeInput('floatStart', d, `${prefix}釣り銭準備金 ${name} 開店時の枚数`),
      makeInput('floatNow', d, `${prefix}釣り銭準備金 ${name} いまの枚数`),
    ]
  })
  const unusedButton = h('button', { type: 'button', class: 'ghost', text: '使っていない' })
  unusedButton.addEventListener('click', options.onFloatUnused)
  const floatUsed = h('b')

  // ---- 計算と結果（筆算: 「−」は左の列に置き、名前の書き出しと金額の右端をそろえる。答えの行だけ太く） ----
  const calcPocket = h('span', { class: 'cash-calc-yen' })
  const calcUsed = h('span', { class: 'cash-calc-yen' })
  const calcSales = h('b', { class: 'cash-calc-yen cash-sales' })
  const calcExpected = h('span', { class: 'cash-calc-yen' })
  const calcDiff = h('b', { class: 'cash-calc-yen cash-diff' })
  const calcLine = (op: string, label: string, amount: HTMLElement) => [
    h('span', { class: 'cash-calc-op', text: op }),
    h(amount.tagName === 'B' ? 'b' : 'span', { text: label }),
    amount,
  ]
  const calcRule = () => h('span', { class: 'cash-calc-rule', 'aria-hidden': 'true' })
  const verdict = h('p', { class: 'cash-verdict', 'aria-live': 'polite' })
  const floatNote = h('p', { class: 'cash-verdict warn' })
  const clearButton = holdButton({ label: '数え直す', armedLabel: '長押しで枚数を消す', onConfirm: options.onClear })

  const element = h('section', { class: 'card cash', 'aria-labelledby': `${idPrefix}-title` }, [
    h('h2', { id: `${idPrefix}-title`, text: options.title ?? 'レジ精算' }),
    h('h3', { class: 'cash-h', text: '売上のポケット' }),
    h('div', { class: 'cash-grid' }, pocketRows),
    h('p', { class: 'cash-sum' }, [h('span', { text: 'ポケットの合計' }), pocketTotal]),
    h('h3', { class: 'cash-h', text: '硬貨の釣り銭準備金' }),
    h('div', { class: 'float-grid' }, [h('span'), h('span', { class: 'cash-th', text: '開店時' }), h('span', { class: 'cash-th', text: 'いま' }), ...floatRows]),
    h('div', { class: 'float-foot' }, [unusedButton, h('span', {}, ['使った釣り銭 ', floatUsed])]),
    h('div', { class: 'cash-calc' }, [
      ...calcLine('', 'ポケットの合計', calcPocket),
      ...calcLine('−', '使った釣り銭', calcUsed),
      calcRule(),
      ...calcLine('', 'お金から出した売上', calcSales),
      ...calcLine('−', options.expectedLabel, calcExpected),
      calcRule(),
      ...calcLine('', '差', calcDiff),
    ]),
    verdict,
    floatNote,
    h('div', { class: 'foot' }, [clearButton]),
  ])

  let current: CashCount | null = null
  for (const { field, denomination, input } of fields) {
    input.addEventListener('input', () => {
      const value = readCount(input.value)
      if (value === undefined || !current) return
      options.onChange(setCashCount(current, field, denomination, value))
    })
    // 受け付けない値（負の数・小数）を打っていたら、欄から離れたときに記録どおりに戻す
    input.addEventListener('blur', () => {
      const n = current?.[field][String(denomination)]
      input.value = n === undefined ? '' : String(n)
    })
  }

  function render(count: CashCount, expected: number, candidates: readonly { name: string; price: number }[]) {
    current = count
    for (const { field, denomination, input } of fields) {
      const n = count[field][String(denomination)]
      // 入力中の欄は書き換えない（打っている途中の値を消さないように）
      if (document.activeElement !== input) input.value = n === undefined ? '' : String(n)
    }
    for (const [d, el] of pocketAmounts) el.textContent = formatPrice(d * (count.pocket[String(d)] ?? 0))

    const s = settle(count)
    pocketTotal.textContent = formatPrice(s.pocket)
    floatUsed.textContent = formatPrice(s.floatUsed)
    calcPocket.textContent = formatPrice(s.pocket)
    calcUsed.textContent = formatPrice(s.floatUsed)
    calcSales.textContent = formatPrice(s.sales)
    calcExpected.textContent = formatPrice(expected)

    const result = compareCash(s, expected)
    // 差 = お金から出した売上 − 数えた売上。ポケットを数えるまでは出さない
    calcDiff.textContent =
      result.kind === 'none'
        ? '—'
        : result.kind === 'match'
          ? formatPrice(0)
          : `${result.kind === 'over' ? '＋' : '−'}${formatPrice(result.amount)}`
    calcDiff.dataset.tone = result.kind === 'match' ? 'ok' : result.kind === 'none' ? 'none' : 'warn'
    const same = (amount: number) => {
      const names = sameAmountNames(amount, candidates)
      return names.length > 0 ? `（${names.join('・')} 1つ分と同じ額）` : ''
    }
    verdict.className = `cash-verdict ${result.kind === 'match' ? 'ok' : result.kind === 'none' ? 'none' : 'warn'}`
    verdict.textContent =
      result.kind === 'none'
        ? `売上のポケットの枚数を入れると、${options.expectedLabel}と比べます。`
        : result.kind === 'match'
          ? 'ぴったり合っています。'
          : result.kind === 'over'
            ? `お金のほうが ${formatPrice(result.amount)} 多い。${options.hints.over}${same(result.amount)}。`
            : `お金のほうが ${formatPrice(result.amount)} 少ない。${options.hints.under}${same(result.amount)}。`

    floatNote.hidden = s.floatProblem === null
    floatNote.textContent =
      s.floatProblem === 'noNow'
        ? 'いまの釣り銭準備金を数えるか、［使っていない］を押してください（使った釣り銭を 0 として計算しています）。'
        : s.floatProblem === 'noStart'
          ? '釣り銭準備金の開店時の枚数を入れてください。'
          : s.floatProblem === 'grew'
            ? 'いまの釣り銭準備金が開店時より多くなっています。売上の硬貨が混ざっていないか確かめてください。'
            : ''
  }

  return { element, render }
}
