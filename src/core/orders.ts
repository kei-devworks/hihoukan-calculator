/**
 * オーダー（お客さん1組の注文）の記録と、その増減（DOM に触れない）。
 * ＋ を押すと今のオーダーに足し、個数・合計はすべてのオーダーから数える（docs/architecture.md）
 */

import type { TallyState } from './tally'

/** 品目 id → 数 */
export type OrderLines = Record<string, number>

/** オーダーを直したときの記録。直す前の中身を残す（あとで戻せるように） */
export type OrderEdit = { at: string; before: OrderLines }

export type Order = {
  /** 1 から増やす。記録の中で重ならない */
  id: number
  /** お客さんのオーダー、または引き継ぎ・更新前の記録など、まとめて入れた数 */
  kind: 'order' | 'handover'
  /** 始めた時刻（ISO 8601）。1時間ごとの推移はこの時刻で分ける */
  openedAt: string
  /** 最後に足した時刻。ここから ORDER_IDLE_MS たつと、今のオーダーではなくなる */
  lastAt: string
  /** ［完了］などで閉じた時刻。null でも、時間がたてば閉じた扱い（isOpen） */
  closedAt: string | null
  lines: OrderLines
  /** 会計で預かった額面（押した順） */
  tenders: number[]
  edits: OrderEdit[]
  /** 取り消した時刻。取り消したオーダーは数に入れないが、元に戻せるよう記録に残す */
  cancelledAt: string | null
  /** まとめて入れた数の出どころ（「更新前の記録」など）。お客さんのオーダーは null */
  source: string | null
}

/** 最後に押してからこの時間がたつと、今のオーダーを閉じる（次に押した分は新しいオーダーになる） */
export const ORDER_IDLE_MS = 3 * 60_000

/** 数に入れるオーダー（取り消したものを除く） */
export function liveOrders(state: TallyState): Order[] {
  return state.orders.filter((o) => o.cancelledAt === null)
}

/** オーダーの点数（品目の数の合計） */
export function pieces(lines: OrderLines): number {
  return Object.values(lines).reduce((sum, n) => sum + n, 0)
}

/** 0 の品目を除いた中身 */
export function cleanLines(lines: OrderLines): OrderLines {
  return Object.fromEntries(Object.entries(lines).filter(([, n]) => n > 0))
}

/** まだ品目を足せる「今のオーダー」か。閉じた・取り消した・最後に押してから時間がたったものは違う */
export function isOpen(order: Order, now: Date): boolean {
  return (
    order.kind === 'order' &&
    order.closedAt === null &&
    order.cancelledAt === null &&
    now.getTime() - Date.parse(order.lastAt) < ORDER_IDLE_MS
  )
}

/** 今のオーダー。いつも記録のいちばん最後にある */
export function openOrder(state: TallyState, now: Date): Order | null {
  const last = state.orders.at(-1)
  return last && isOpen(last, now) ? last : null
}

/** 閉じたあとのいちばん新しいオーダー（「前のオーダー」）。引き継ぎは含めない */
export function previousOrder(state: TallyState, now: Date): Order | null {
  for (let i = state.orders.length - 1; i >= 0; i--) {
    const order = state.orders[i]!
    if (order.kind === 'order' && order.cancelledAt === null && !isOpen(order, now)) return order
  }
  return null
}

export function findOrder(state: TallyState, id: number): Order | null {
  return state.orders.find((o) => o.id === id) ?? null
}

function nextId(state: TallyState): number {
  return state.orders.reduce((max, o) => Math.max(max, o.id), 0) + 1
}

function replaceOrder(state: TallyState, order: Order, at: string): TallyState {
  return { ...state, orders: state.orders.map((o) => (o.id === order.id ? order : o)), updatedAt: at }
}

/** ＋: 今のオーダーに1つ足す。今のオーダーがなければ、新しいオーダーを始める */
export function addItem(state: TallyState, itemId: string, now: Date): TallyState {
  const at = now.toISOString()
  const open = openOrder(state, now)
  if (open) {
    return replaceOrder(state, { ...open, lines: { ...open.lines, [itemId]: (open.lines[itemId] ?? 0) + 1 }, lastAt: at }, at)
  }
  const order: Order = {
    id: nextId(state),
    kind: 'order',
    openedAt: at,
    lastAt: at,
    closedAt: null,
    lines: { [itemId]: 1 },
    tenders: [],
    edits: [],
    cancelledAt: null,
    source: null,
  }
  return { ...state, orders: [...state.orders, order], updatedAt: at }
}

export type RemoveResult = {
  state: TallyState
  /** 減らしたオーダー（減らす前の姿）。何も減らせなければ null */
  from: Order | null
  /** 今のオーダーから減らしたか（false なら、閉じた前のオーダーや引き継ぎから減らした） */
  fromOpen: boolean
}

/**
 * −: 今のオーダーにその品目があれば、そこから1つ減らす。なければ、その品目がある
 * いちばん新しいオーダー（取り消したものを除く）から減らす。
 * 今のオーダーが空になったら消す（押しまちがいの途中）。前のオーダーが空になったら取り消し済みにする（元に戻せるように中身は残す）
 */
export function removeItem(state: TallyState, itemId: string, now: Date): RemoveResult {
  const at = now.toISOString()
  const open = openOrder(state, now)
  if (open && (open.lines[itemId] ?? 0) > 0) {
    const lines = cleanLines({ ...open.lines, [itemId]: open.lines[itemId]! - 1 })
    const next =
      pieces(lines) === 0
        ? { ...state, orders: state.orders.filter((o) => o.id !== open.id), updatedAt: at }
        : replaceOrder(state, { ...open, lines, lastAt: at }, at)
    return { state: next, from: open, fromOpen: true }
  }

  const live = liveOrders(state)
  for (let i = live.length - 1; i >= 0; i--) {
    const order = live[i]!
    if ((order.lines[itemId] ?? 0) === 0) continue
    const lines = cleanLines({ ...order.lines, [itemId]: order.lines[itemId]! - 1 })
    const changed: Order =
      pieces(lines) === 0
        ? { ...order, closedAt: order.closedAt ?? at, cancelledAt: at }
        : { ...order, lines, edits: [...order.edits, { at, before: order.lines }] }
    return { state: replaceOrder(state, changed, at), from: order, fromOpen: false }
  }
  return { state, from: null, fromOpen: false }
}

/** ［完了］: 今のオーダーを閉じる */
export function closeOrder(state: TallyState, id: number, now: Date): TallyState {
  const order = findOrder(state, id)
  if (!order || order.closedAt !== null) return state
  const at = now.toISOString()
  return replaceOrder(state, { ...order, closedAt: at }, at)
}
