import { allItems, type CatalogItem } from '../core/catalog'
import { formatPrice } from '../core/format'
import { openOrder, pieces, previousOrder, type Order } from '../core/orders'
import { countOf, displayName, linesTotal, type TallyConfig, type TallyState } from '../core/tally'
import { formatTime } from '../core/time'
import { h } from './dom'
import { holdButton } from './hold-button'

export type OrderPanelActions = {
  add: (itemId: string) => void
  remove: (itemId: string) => void
  complete: (orderId: number) => void
  cancel: (orderId: number) => void
  /** オーダーを直す画面を開く */
  edit: (orderId: number) => void
  /** ほかの画面から「数える」へ戻る */
  showCount: () => void
}

export type OrderPanel = {
  element: HTMLElement
  /** onCount: いま「数える」の画面か */
  render: (state: TallyState, now: Date, onCount: boolean) => void
  /** 次に描くとき、この品目の行が見えるようにパネルの中をスクロールし、少し光らせる（＋/− を押した品目） */
  touch: (itemId: string) => void
}

/**
 * 画面の下に出す「今のオーダー」と「前のオーダー」。
 * - 今のオーダー: 品目ごとに「1,000円 3個 ＋2 → 5個 ［−］［＋］」、［完了］、［このオーダーを取り消す］（長押し）
 * - 閉じたあと: 「前のオーダー 21:05・3点 ￥2,500 ›」。押すと中身を出し直す
 * - ほかの画面にいるあいだにオーダーが開いていれば「今のオーダー … ›」とだけ出し、押すと「数える」に戻る
 */
export function orderPanel(config: TallyConfig, actions: OrderPanelActions): OrderPanel {
  /** 中身を出している前のオーダーの id（null なら小さく出すだけ） */
  let viewingId: number | null = null
  /** いま今のオーダーとして出しているオーダーの id（ボタンが押されたときに使う） */
  let openId: number | null = null
  /** 最後に ＋/− を押した品目（次に描くときに見えるようにする） */
  let touched: string | null = null

  // ---- 今のオーダー（一度だけ作って、中身を描き直す） ----
  const openTitle = h('span', { class: 'order-title' })
  const openPieces = h('b', { class: 'order-pieces' })
  const openTotal = h('b', { class: 'order-total' })
  const completeButton = h('button', { type: 'button', class: 'ghost', text: '完了' })
  const openLines = h('div', { class: 'order-lines' })
  const cancelButton = holdButton({
    label: 'このオーダーを取り消す',
    armedLabel: '長押しでオーダーを取り消す',
    onConfirm: () => openId !== null && actions.cancel(openId),
  })
  completeButton.addEventListener('click', () => openId !== null && actions.complete(openId))
  const openPanel = h('section', { class: 'order-panel', 'aria-label': '今のオーダー' }, [
    h('div', { class: 'order-head' }, [h('div', { class: 'order-sum' }, [openTitle, openPieces, openTotal]), completeButton]),
    openLines,
    h('div', { class: 'order-foot' }, [cancelButton, h('p', { class: 'order-note', text: '3分で自動で閉じます' })]),
  ])

  // ---- 前のオーダー（中身） ----
  const prevTitle = h('span', { class: 'order-title' })
  const prevPieces = h('b', { class: 'order-pieces' })
  const prevTotal = h('b', { class: 'order-total' })
  const prevLines = h('div', { class: 'order-lines' })
  const prevClose = h('button', { type: 'button', class: 'ghost order-close', 'aria-label': '前のオーダーを閉じる', text: '×' })
  prevClose.addEventListener('click', () => {
    viewingId = null
    rerender()
  })
  const editButton = h('button', { type: 'button', class: 'ghost', text: '編集' })
  editButton.addEventListener('click', () => viewingId !== null && actions.edit(viewingId))
  const prevPanel = h('section', { class: 'order-panel view', 'aria-label': '前のオーダー' }, [
    h('div', { class: 'order-head' }, [h('div', { class: 'order-sum' }, [prevTitle, prevPieces, prevTotal]), prevClose]),
    prevLines,
    h('div', { class: 'order-foot end' }, [editButton]),
  ])

  // ---- 小さく出すとき ----
  const chip = h('button', { type: 'button', class: 'order-chip' })
  let chipAction: () => void = () => {}
  chip.addEventListener('click', () => chipAction())

  const element = h('div', { class: 'order-dock' }, [openPanel, prevPanel, chip])

  let last: { state: TallyState; now: Date; onCount: boolean } | null = null
  const rerender = () => last && render(last.state, last.now, last.onCount)

  const summary = (state: TallyState, order: Order) =>
    `${pieces(order.lines)}点 ${formatPrice(linesTotal(config, state, order.lines))}`

  const linesOf = (order: Order): [CatalogItem, number][] =>
    allItems(config).flatMap((item) => (order.lines[item.id] ? [[item, order.lines[item.id]!] as [CatalogItem, number]] : []))

  function render(state: TallyState, now: Date, onCount: boolean) {
    last = { state, now, onCount }
    const open = openOrder(state, now)
    const previous = previousOrder(state, now)
    if (open) viewingId = null
    if (viewingId !== null && previous?.id !== viewingId) viewingId = null
    openId = open?.id ?? null

    openPanel.hidden = !(open && onCount)
    prevPanel.hidden = !(!open && onCount && viewingId !== null && previous)
    let chipText: string | null = null
    if (open && !onCount) chipText = `今のオーダー ${formatTime(new Date(open.openedAt))}〜・${summary(state, open)} ›`
    else if (!open && onCount && previous && viewingId === null) {
      chipText = `前のオーダー ${formatTime(new Date(previous.openedAt))}・${summary(state, previous)} ›`
    }
    chip.hidden = chipText === null
    if (chipText !== null) {
      chip.textContent = chipText
      chipAction = open ? actions.showCount : () => {
        viewingId = previous!.id
        rerender()
      }
    }

    if (open && onCount) {
      openTitle.textContent = `今のオーダー ${formatTime(new Date(open.openedAt))}〜`
      openPieces.textContent = `${pieces(open.lines)}点`
      openTotal.textContent = formatPrice(linesTotal(config, state, open.lines))
      openLines.replaceChildren(
        ...linesOf(open).map(([item, n]) => {
          const name = displayName(config, state, item)
          const after = countOf(state, item.id)
          const minus = h('button', { type: 'button', class: 'mini-step', 'aria-label': `今のオーダーの${name}を1つ減らす`, text: '−' })
          const plus = h('button', { type: 'button', class: 'mini-step', 'aria-label': `今のオーダーの${name}を1つ増やす`, text: '＋' })
          minus.addEventListener('click', () => actions.remove(item.id))
          plus.addEventListener('click', () => actions.add(item.id))
          return h('div', { class: item.id === touched ? 'order-line touched' : 'order-line', 'data-item': item.id }, [
            h('span', { class: 'order-name', text: name }),
            h('span', { class: 'order-change' }, [
              `${after - n}個 `,
              h('b', { class: 'order-added', text: `＋${n}` }),
              ' → ',
              h('b', { class: 'order-after', text: `${after}個` }),
            ]),
            h('span', { class: 'order-steps' }, [minus, plus]),
          ])
        }),
      )
    }

    // 押した品目の行が、パネルの中のスクロールで隠れていたら見えるところまで動かす（ページは動かさない）
    const line = touched ? openLines.querySelector<HTMLElement>(`[data-item="${touched}"]`) : null
    if (line) {
      const top = line.offsetTop
      const bottom = top + line.offsetHeight
      if (top < openLines.scrollTop) openLines.scrollTop = top
      else if (bottom > openLines.scrollTop + openLines.clientHeight) openLines.scrollTop = bottom - openLines.clientHeight
    }
    touched = null

    if (!prevPanel.hidden && previous) {
      prevTitle.textContent = `前のオーダー ${formatTime(new Date(previous.openedAt))}`
      prevPieces.textContent = `${pieces(previous.lines)}点`
      prevTotal.textContent = formatPrice(linesTotal(config, state, previous.lines))
      prevLines.replaceChildren(
        ...linesOf(previous).map(([item, n]) =>
          h('div', { class: 'order-line', 'data-item': item.id }, [
            h('span', { class: 'order-name', text: displayName(config, state, item) }),
            h('span', { class: 'order-change', text: `×${n}` }),
          ]),
        ),
      )
    }
  }

  return {
    element,
    render,
    touch: (itemId) => {
      touched = itemId
    },
  }
}
