import { denominations } from '../core/cash'
import { changeDue, tenderBreakdown, tenderTotal } from '../core/checkout'
import { formatNumber, formatPrice } from '../core/format'
import { findOrder, pieces, type Order } from '../core/orders'
import { displayName, itemsOf, linesTotal, type TallyConfig, type TallyState } from '../core/tally'
import { formatTime } from '../core/time'
import { h } from './dom'

export type CheckoutActions = {
  addTender: (orderId: number, denomination: number) => void
  /** all なら全部、でなければ最後の1枚を戻す */
  removeTender: (orderId: number, all: boolean) => void
  /** ［完了］: オーダーを閉じる */
  complete: (orderId: number) => void
}

/** 「1,000×2・500×1」 */
export function describeTenders(tenders: readonly number[]): string {
  return tenderBreakdown(tenders)
    .map(({ denomination, count }) => `${formatNumber(denomination)}×${count}`)
    .join('・')
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
 * 会計の画面（下から開くダイアログ）。合計を大きく出し、受け取ったお札・硬貨のボタンを押すたびに預かりに足す。
 * お釣りを大きく出す。押した額面はすぐオーダーに保存する（getState で描き直すたびに読み直す）
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

  const total = h('b', { class: 'checkout-total' })
  const lines = h('p', { class: 'checkout-lines' })
  const tendered = h('b', { class: 'checkout-tendered' })
  const breakdown = h('small', { class: 'checkout-breakdown' })
  const change = h('div', { class: 'checkout-change', 'aria-live': 'polite' })
  const undoOne = h('button', { type: 'button', class: 'ghost', text: '1つ戻す' })
  const undoAll = h('button', { type: 'button', class: 'ghost', text: '0に戻す' })
  const coins = new Set(cash.coins)
  const tenderButtons = denominations(cash).map((d) => {
    const button = h('button', {
      type: 'button',
      class: coins.has(d) ? 'tender coin' : 'tender',
      'aria-label': `${formatNumber(d)}円を預かりに足す`,
      text: formatNumber(d),
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

  const dialog = h('dialog', { class: 'checkout', 'aria-labelledby': 'checkout-title' }, [
    h('div', { class: 'checkout-head' }, [
      h('h2', { id: 'checkout-title', text: `お会計（${formatTime(new Date(first.openedAt))} のオーダー）` }),
      total,
    ]),
    lines,
    h('p', { class: 'checkout-label', text: 'お預かり（受け取った枚数だけ押す）' }),
    h('div', { class: 'tenders' }, tenderButtons),
    h('div', { class: 'checkout-row' }, [
      h('span', {}, ['お預かり ', tendered, breakdown]),
      h('span', { class: 'checkout-fix' }, [undoOne, undoAll]),
    ]),
    change,
    h('div', { class: 'editor-foot' }, [backButton, completeButton]),
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
    total.textContent = formatPrice(sum)
    lines.textContent = `${itemsOf(config, state)
      .flatMap((item) => (order.lines[item.id] ? [`${displayName(config, state, item)}×${order.lines[item.id]}`] : []))
      .join('・')}（${pieces(order.lines)}点）`
    tendered.textContent = formatPrice(paid)
    breakdown.textContent = paid > 0 ? describeTenders(order.tenders) : ''
    undoOne.disabled = paid === 0
    undoAll.disabled = paid === 0

    const due = changeDue(sum, paid)
    change.className = `checkout-change ${due.kind}`
    if (due.kind === 'none') change.replaceChildren(h('span', { text: '受け取ったお札・硬貨のボタンを押してください' }))
    else if (due.kind === 'short') change.replaceChildren(h('span', { text: 'あと' }), h('b', { text: formatPrice(due.amount) }))
    else change.replaceChildren(h('span', { text: 'お釣り' }), h('b', { text: due.amount === 0 ? 'なし（ちょうど）' : formatPrice(due.amount) }))
  }

  render()
  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  return dialog
}
