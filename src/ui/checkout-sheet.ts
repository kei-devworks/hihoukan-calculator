import { denominations } from '../core/cash'
import { changeDue, receiptGroups, tenderBreakdown, tenderTotal, type ReceiptGroup, type ReceiptLine } from '../core/checkout'
import { formatNumber, formatPrice, formatPriceEn } from '../core/format'
import { findOrder, type Order } from '../core/orders'
import { linesTotal, type TallyConfig, type TallyState } from '../core/tally'
import { formatTime } from '../core/time'
import { h } from './dom'

export type CheckoutActions = {
  addTender: (orderId: number, denomination: number) => void
  /** all なら全部、でなければ最後の1枚を戻す */
  removeTender: (orderId: number, all: boolean) => void
  /** ［完了］: オーダーを閉じる */
  complete: (orderId: number) => void
}

/** 「預かり ￥5,000 → お釣り ￥2,000」「預かり ￥1,000（あと ￥1,500）」。預かっていなければ null */
export function describePayment(config: TallyConfig, state: TallyState, order: Order): string | null {
  const tendered = tenderTotal(order.tenders)
  const due = changeDue(linesTotal(config, state, order.lines), tendered)
  if (due.kind === 'none') return null
  if (due.kind === 'short') return `預かり ${formatPrice(tendered)}（あと ${formatPrice(due.amount)}）`
  return `預かり ${formatPrice(tendered)} → お釣り ${due.amount === 0 ? 'なし' : formatPrice(due.amount)}`
}

/**
 * 会計の画面（全画面のダイアログ）。上の囲みはお客様に見せるレシートで、英語を先に大きく、日本語は小さく添える
 * （お客様の多くが海外の方なので）。品目は設定のジャンルにまとめる（receiptGroups）。
 * 受け取ったお札・硬貨のボタンを押すたびに預かりに足し、お釣りを大きく出す。押した額面はすぐオーダーに保存する
 * （getState で描き直すたびに読み直す）。iPhone の Safari でも1画面に収まるよう、品目が多いときは品目の欄だけスクロールする
 */
export function openCheckout(
  config: TallyConfig,
  getState: () => TallyState,
  orderId: number,
  actions: CheckoutActions,
): HTMLDialogElement | null {
  const cash = config.cash
  const first = findOrder(getState(), orderId)
  if (!cash || !first) return null

  // 「Total お会計」のように、英語のあとに日本語を小さく添える
  const label = (en: string, ja: string) => h('span', { class: 'receipt-label' }, [`${en} `, h('small', { text: ja })])
  const items = h('div', { class: 'receipt-items' })
  const total = h('b', { class: 'checkout-total' })
  const tendered = h('b', { class: 'checkout-tendered' })
  const breakdown = h('small', { class: 'checkout-breakdown' })
  const change = h('p', { class: 'receipt-line checkout-change', 'aria-live': 'polite' })
  const thanks = h('p', { class: 'receipt-thanks' }, ['Thank you! ', h('small', { text: 'ありがとうございました' })])
  const undoOne = h('button', { type: 'button', class: 'ghost tender-fix', text: '1つ戻す' })
  const undoAll = h('button', { type: 'button', class: 'ghost tender-fix', text: '0に戻す' })
  const coins = new Set(cash.coins)
  const tenderButtons = denominations(cash).map((d) => {
    const button = h('button', {
      type: 'button',
      class: coins.has(d) ? 'tender coin' : 'tender',
      'aria-label': `${formatNumber(d)}円を預かりに足す`,
      // 押すたびに預かりに足すことがわかるよう、＋を付ける
      text: `＋${formatNumber(d)}`,
    })
    button.addEventListener('click', () => {
      actions.addTender(orderId, d)
      render()
    })
    return button
  })
  undoOne.addEventListener('click', () => {
    actions.removeTender(orderId, false)
    render()
  })
  undoAll.addEventListener('click', () => {
    actions.removeTender(orderId, true)
    render()
  })
  const backButton = h('button', { type: 'button', class: 'ghost', text: '戻る' })
  const completeButton = h('button', { type: 'button', class: 'solid', text: '完了' })

  // 品目が多くて入りきらないときだけ、品目の欄がスクロールする。下に続きがあるうちは、下の端をぼかして知らせる
  const markMore = () => items.classList.toggle('more', items.scrollTop + items.clientHeight < items.scrollHeight - 2)
  items.addEventListener('scroll', markMore)

  const dialog = h('dialog', { class: 'checkout', 'aria-label': `お会計（${formatTime(new Date(first.openedAt))} のオーダー）` }, [
    h('div', { class: 'checkout-receipt' }, [
      h('p', { class: 'receipt-head' }, [label('Checkout', 'お会計'), h('span', { text: formatTime(new Date(first.openedAt)) })]),
      items,
      h('div', { class: 'receipt-sums' }, [
        h('p', { class: 'receipt-line receipt-total' }, [label('Total', 'お会計'), total]),
        h('p', { class: 'receipt-line' }, [h('span', {}, [label('Cash', 'お預かり'), breakdown]), tendered]),
        change,
        thanks,
      ]),
    ]),
    // お札・硬貨と直すボタンを4列2段に（係の人の操作なので日本語のまま）
    h('div', { class: 'tenders' }, [...tenderButtons, undoOne, undoAll]),
    h('div', { class: 'checkout-foot' }, [backButton, completeButton]),
  ])

  const close = () => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close()
    dialog.remove()
  }
  backButton.addEventListener('click', close)
  completeButton.addEventListener('click', () => {
    close()
    actions.complete(orderId)
  })
  dialog.addEventListener('close', () => dialog.remove())

  function render() {
    const state = getState()
    const order = findOrder(state, orderId)
    if (!order) return close()
    const sum = linesTotal(config, state, order.lines)
    const paid = tenderTotal(order.tenders)
    items.replaceChildren(...receiptGroups(config, state, order.lines).flatMap(receiptRows))
    total.textContent = formatPriceEn(sum)
    tendered.textContent = paid > 0 ? formatPriceEn(paid) : '—'
    breakdown.textContent = paid > 0 ? describeTendersEn(order.tenders) : '受け取ったお札・硬貨を押す'
    undoOne.disabled = paid === 0
    undoAll.disabled = paid === 0

    const due = changeDue(sum, paid)
    change.hidden = due.kind === 'none'
    change.className = `receipt-line checkout-change ${due.kind}`
    if (due.kind === 'short') change.replaceChildren(label('Amount due', 'あと'), h('b', { text: formatPriceEn(due.amount) }))
    else if (due.kind === 'change') {
      change.replaceChildren(label('Change', 'お釣り'), h('b', { text: due.amount === 0 ? 'No change' : formatPriceEn(due.amount) }))
    }
    thanks.hidden = due.kind !== 'change'
    markMore()
  }

  render()
  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  markMore()
  return dialog
}

/** 「¥1,000×3, ¥500×1」（お客様に見せる預かりの内訳） */
function describeTendersEn(tenders: readonly number[]): string {
  return tenderBreakdown(tenders)
    .map(({ denomination, count }) => `${formatPriceEn(denomination)}×${count}`)
    .join(', ')
}

/**
 * レシートのジャンル1つ分の行（「名前 ×数 金額」の3列）。1品だけのジャンルはジャンル名の行に数と金額、
 * そうでなければジャンル名の下に品目を字下げして並べる
 */
function receiptRows(group: ReceiptGroup): HTMLElement[] {
  const name = (cls: string, en: string, ja: string | null) => h('span', { class: cls }, ja ? [`${en} `, h('small', { text: ja })] : [en])
  const amounts = (line: ReceiptLine) => [
    h('span', { class: 'receipt-count', text: `×${line.count}` }),
    h('span', { class: 'receipt-amount', text: formatPriceEn(line.amount) }),
  ]
  if (group.single) return [name('receipt-genre', group.en, group.ja), ...amounts(group.lines[0]!)]
  return [
    name('receipt-genre full', group.en, group.ja),
    ...group.lines.flatMap((line) => [name('receipt-item', line.en, line.ja), ...amounts(line)]),
  ]
}
