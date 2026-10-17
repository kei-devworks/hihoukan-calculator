import { allItems } from '../core/catalog'
import { formatPrice } from '../core/format'
import { hourlyEntries, type HourEntry } from '../core/hourly'
import { liveOrders, pieces, type Order } from '../core/orders'
import { displayName, linesTotal, type TallyConfig, type TallyState } from '../core/tally'
import { formatTime } from '../core/time'
import { h } from './dom'

export type TallyLogActions = {
  edit: (orderId: number) => void
  restore: (orderId: number) => void
}

export type TallyLog = {
  element: HTMLElement
  render: (state: TallyState, now: Date) => void
}

/**
 * 「記録」の画面: オーダーの数と最後に押した時刻、1時間ごとの推移、時間ごとのオーダーの一覧。
 * 時間の行を開くとオーダーが新しい順に並び、［編集］と、取り消したものには［元に戻す］を置く
 */
export function tallyLog(config: TallyConfig, actions: TallyLogActions): TallyLog {
  const items = allItems(config)
  const summary = h('p', { class: 'log-summary' })
  const list = h('div', { class: 'log-hours' })
  const empty = h('p', { class: 'log-empty', text: 'まだ記録がありません。＋ を押すと、ここにオーダーごとに残ります。' })
  const element = h('section', { class: 'card log', 'aria-labelledby': 'log-title' }, [
    h('h2', { id: 'log-title', text: 'オーダーの記録と推移' }),
    summary,
    empty,
    list,
  ])
  /** 開いている時間（描き直しても開いたままにする）。はじめは、いまの時間を開く */
  const openHours = new Set<number>()
  const closedHours = new Set<number>()

  const orderRow = (state: TallyState, order: Order, cancelled: boolean) => {
    const lines = items.flatMap((item) =>
      order.lines[item.id] ? [h('span', { text: `${displayName(config, state, item)} ×${order.lines[item.id]}` })] : [],
    )
    const meta: (Node | string)[] = []
    if (cancelled) meta.push(h('span', { text: `取り消し済み（${formatTime(new Date(order.cancelledAt!))}）` }))
    else {
      meta.push(h('span', { text: `${pieces(order.lines)}点` }))
      if (order.edits.length > 0) meta.push(h('span', { class: 'log-badge', text: `変更 ${order.edits.length}回` }))
    }
    const button = cancelled
      ? h('button', { type: 'button', class: 'ghost', text: '元に戻す', 'aria-label': `${formatTime(new Date(order.openedAt))} のオーダーを元に戻す` })
      : h('button', { type: 'button', class: 'ghost', text: '編集', 'aria-label': `${formatTime(new Date(order.openedAt))} のオーダーを編集` })
    button.addEventListener('click', () => (cancelled ? actions.restore(order.id) : actions.edit(order.id)))
    return h('div', { class: cancelled ? 'log-order cancelled' : 'log-order', 'data-order': order.id }, [
      h('span', { class: 'log-time', text: formatTime(new Date(order.openedAt)) }),
      h('span', { class: 'log-items' }, lines),
      h('b', { class: 'log-yen', text: formatPrice(linesTotal(config, state, order.lines)) }),
      h('span', { class: 'log-meta' }, meta),
      button,
    ])
  }

  const hourRow = (state: TallyState, entry: HourEntry, max: number) => {
    const key = entry.start.getTime()
    const warn = entry.empty && !entry.covered && !entry.current
    const note = entry.empty ? (entry.covered ? '引き継ぎ分に含む' : warn ? '記録なし（押し忘れ？）' : 'まだありません') : null
    const head = h('summary', { class: 'log-hour-head' }, [
      h('span', { class: 'log-hour-label', text: entry.label }),
      h('span', { class: 'log-count', text: `${entry.orders.length}件` }),
      note
        ? h('span', { class: 'log-note', text: note })
        : h('span', { class: 'log-bar', 'aria-hidden': 'true' }, [h('i', { style: `width: ${max > 0 ? (entry.total / max) * 100 : 0}%` })]),
      h('span', { class: 'log-amounts' }, [
        h('b', { text: formatPrice(entry.total) }),
        h('small', { text: `累計 ${formatPrice(entry.cumulative)}` }),
      ]),
    ])
    const orders = [...entry.orders, ...entry.cancelled].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
    const details = h('details', { class: warn ? 'log-hour warn' : 'log-hour', 'data-hour': key }, [
      head,
      h(
        'div',
        { class: 'log-orders' },
        orders.length > 0 ? orders.map((o) => orderRow(state, o, o.cancelledAt !== null)) : [h('p', { class: 'log-empty', text: 'この時間のオーダーはありません' })],
      ),
    ])
    details.open = openHours.has(key) || (entry.current && !closedHours.has(key))
    details.addEventListener('toggle', () => {
      if (details.open) {
        openHours.add(key)
        closedHours.delete(key)
      } else {
        openHours.delete(key)
        closedHours.add(key)
      }
    })
    return details
  }

  function render(state: TallyState, now: Date) {
    const live = liveOrders(state)
    const customers = live.filter((o) => o.kind === 'order')
    const last = live.reduce<Order | null>((latest, o) => (!latest || Date.parse(o.lastAt) > Date.parse(latest.lastAt) ? o : latest), null)
    const cancelled = state.orders.length - live.length
    empty.hidden = state.orders.length > 0
    summary.hidden = state.orders.length === 0
    const parts = [`${customers.length}オーダー`]
    if (last) {
      const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(last.lastAt)) / 60_000))
      parts.push(`最後の記録 ${formatTime(new Date(last.lastAt))}（${minutes === 0 ? 'いま' : `${minutes}分前`}）`)
    }
    if (cancelled > 0) parts.push(`取り消し ${cancelled}件`)
    summary.textContent = parts.join('・')

    const entries = hourlyEntries(config, state, now)
    const max = Math.max(0, ...entries.flatMap((e) => (e.kind === 'hour' ? [e.total] : [])))
    list.replaceChildren(
      ...entries.map((entry) => {
        if (entry.kind === 'hour') return hourRow(state, entry, max)
        const order = entry.order
        const migrated = order.source === '更新前の記録'
        const edit = h('button', { type: 'button', class: 'ghost', text: '編集', 'aria-label': `${formatTime(new Date(order.openedAt))} の${migrated ? 'まとめて入れた数' : '引き継ぎ'}を編集` })
        edit.addEventListener('click', () => actions.edit(order.id))
        return h('div', { class: 'log-handover', 'data-order': order.id }, [
          h('span', { class: 'log-time', text: formatTime(new Date(order.openedAt)) }),
          h('span', { class: 'log-items' }, [
            h('span', { class: 'log-tag', text: migrated ? 'まとめて入れた数' : '引き継ぎ' }),
            h('span', { text: order.source ?? '' }),
          ]),
          h('b', { class: 'log-yen', text: formatPrice(entry.total) }),
          h('span', { class: 'log-meta' }, [h('span', { text: `${entry.pieces}点・累計 ${formatPrice(entry.cumulative)}` })]),
          edit,
        ])
      }),
    )
  }

  return { element, render }
}
