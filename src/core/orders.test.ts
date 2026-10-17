import { describe, expect, it } from 'vitest'
import {
  addItem,
  cancelOrder,
  closeOrder,
  editOrder,
  isOpen,
  openOrder,
  ORDER_IDLE_MS,
  pieces,
  previousOrder,
  removeItem,
  restoreOrder,
  revertEdit,
} from './orders'
import { countsOf, initialState, type TallyState } from './tally'

const base = new Date('2026-10-15T21:00:00+09:00')
/** base から min 分あと */
const at = (min: number) => new Date(base.getTime() + min * 60_000)

/** 品目 id を順に ＋ する（時刻は分で指定） */
function press(state: TallyState, ...taps: [string, number][]): TallyState {
  return taps.reduce((s, [id, min]) => addItem(s, id, at(min)), state)
}

describe('addItem（＋）', () => {
  it('今のオーダーがなければ始め、3分のうちに押した分は同じオーダーに足す', () => {
    const state = press(initialState(), ['a', 0], ['a', 1], ['hotate', 2.5])
    expect(state.orders).toHaveLength(1)
    expect(state.orders[0]).toMatchObject({
      id: 1,
      kind: 'order',
      openedAt: at(0).toISOString(),
      lastAt: at(2.5).toISOString(),
      closedAt: null,
      lines: { a: 2, hotate: 1 },
    })
    expect(state.updatedAt).toBe(at(2.5).toISOString())
  })

  it('最後に押してから3分たつと、次に押した分は新しいオーダーになる', () => {
    const state = press(initialState(), ['a', 0], ['a', 3])
    expect(state.orders.map((o) => o.lines)).toEqual([{ a: 1 }, { a: 1 }])
    expect(state.orders.map((o) => o.id)).toEqual([1, 2])
  })

  it('［完了］で閉じたあとに押した分は、新しいオーダーになる', () => {
    let state = press(initialState(), ['a', 0])
    state = closeOrder(state, 1, at(0.5))
    state = press(state, ['b', 1])
    expect(state.orders.map((o) => o.lines)).toEqual([{ a: 1 }, { b: 1 }])
    expect(state.orders[0]!.closedAt).toBe(at(0.5).toISOString())
  })

  it('元の状態は書き換えない', () => {
    const before = press(initialState(), ['a', 0])
    addItem(before, 'a', at(1))
    expect(before.orders[0]!.lines).toEqual({ a: 1 })
  })
})

describe('isOpen・openOrder・previousOrder', () => {
  it('最後に押してから3分のうちは今のオーダー。過ぎたら前のオーダーになる', () => {
    const state = press(initialState(), ['a', 0])
    const order = state.orders[0]!
    expect(isOpen(order, new Date(at(0).getTime() + ORDER_IDLE_MS - 1))).toBe(true)
    expect(isOpen(order, new Date(at(0).getTime() + ORDER_IDLE_MS))).toBe(false)
    expect(openOrder(state, at(1))?.id).toBe(1)
    expect(previousOrder(state, at(1))).toBeNull()
    expect(openOrder(state, at(5))).toBeNull()
    expect(previousOrder(state, at(5))?.id).toBe(1)
  })

  it('前のオーダーは、取り消したオーダーと引き継ぎを飛ばす', () => {
    let state = press(initialState(), ['a', 0], ['b', 5])
    state = { ...state, orders: state.orders.map((o) => (o.id === 2 ? { ...o, cancelledAt: at(6).toISOString() } : o)) }
    expect(previousOrder(state, at(10))?.id).toBe(1)
    const handover = { ...state.orders[0]!, id: 3, kind: 'handover' as const }
    expect(previousOrder({ ...state, orders: [...state.orders, handover] }, at(10))?.id).toBe(1)
  })
})

describe('removeItem（−）', () => {
  it('今のオーダーにある品目は、そこから減らす', () => {
    const state = press(initialState(), ['a', 0], ['a', 1], ['b', 1])
    const result = removeItem(state, 'a', at(2))
    expect(result.fromOpen).toBe(true)
    expect(result.state.orders[0]!.lines).toEqual({ a: 1, b: 1 })
    expect(result.state.orders[0]!.edits).toEqual([])
  })

  it('今のオーダーが空になったら、そのオーダーは消す（押しまちがいの途中）', () => {
    const state = press(initialState(), ['a', 0])
    const result = removeItem(state, 'a', at(1))
    expect(result.state.orders).toEqual([])
    expect(countsOf(result.state)).toEqual({})
  })

  it('今のオーダーにない品目は、その品目があるいちばん新しいオーダーから減らし、直した記録を残す', () => {
    const state = press(initialState(), ['a', 0], ['a', 0], ['a', 10], ['b', 10], ['b', 11])
    // 1件目 {a:2}、2件目（今のオーダー）{a:1, b:2}。2件目の a を先に減らす
    const first = removeItem(state, 'a', at(12))
    expect(first.fromOpen).toBe(true)
    // 2件目の a はもうないので、1件目から減らす
    const second = removeItem(first.state, 'a', at(12.5))
    expect(second.fromOpen).toBe(false)
    expect(second.from?.id).toBe(1)
    expect(second.state.orders[0]!.lines).toEqual({ a: 1 })
    expect(second.state.orders[0]!.edits).toEqual([{ at: at(12.5).toISOString(), before: { a: 2 } }])
  })

  it('前のオーダーが空になったら、中身を残したまま取り消し済みにする（元に戻せるように）', () => {
    const state = press(initialState(), ['a', 0])
    const result = removeItem(state, 'a', at(10))
    const order = result.state.orders[0]!
    expect(order.cancelledAt).toBe(at(10).toISOString())
    expect(order.lines).toEqual({ a: 1 })
    expect(countsOf(result.state)).toEqual({})
  })

  it('どこにもない品目なら何もしない（0 より下がらない）', () => {
    const state = press(initialState(), ['a', 0])
    const result = removeItem(state, 'b', at(1))
    expect(result.from).toBeNull()
    expect(result.state).toBe(state)
  })
})

describe('pieces', () => {
  it('品目の数を足す', () => {
    expect(pieces({ a: 2, b: 1 })).toBe(3)
    expect(pieces({})).toBe(0)
  })
})

describe('editOrder（編集の画面で保存）', () => {
  const two = () => press(initialState(), ['a', 0], ['a', 0], ['b', 10]) // 1件目 {a:2}、2件目 {b:1}

  it('中身を差し替え、直す前の中身を記録に残す。0 の品目は持たない', () => {
    const state = editOrder(two(), 1, { a: 1, hotate: 2, matcha: 0 }, at(20))
    const order = state.orders[0]!
    expect(order.lines).toEqual({ a: 1, hotate: 2 })
    expect(order.edits).toEqual([{ at: at(20).toISOString(), before: { a: 2 } }])
    expect(countsOf(state)).toEqual({ a: 1, b: 1, hotate: 2 })
    expect(state.updatedAt).toBe(at(20).toISOString())
  })

  it('変わっていなければ何もしない（記録も増やさない）', () => {
    const state = two()
    expect(editOrder(state, 1, { a: 2 }, at(20))).toBe(state)
  })

  it('中身を空にして保存したら、中身を残したまま取り消し済みにする', () => {
    const order = editOrder(two(), 1, {}, at(20)).orders[0]!
    expect(order.cancelledAt).toBe(at(20).toISOString())
    expect(order.lines).toEqual({ a: 2 })
  })

  it('ない id なら何もしない', () => {
    const state = two()
    expect(editOrder(state, 99, { a: 1 }, at(20))).toBe(state)
  })
})

describe('cancelOrder・restoreOrder（取り消しと元に戻す）', () => {
  it('取り消したオーダーは数に入れず、閉じる。元に戻すと数に入る', () => {
    let state = press(initialState(), ['a', 0], ['b', 0.5]) // 今のオーダー {a:1, b:1}
    state = cancelOrder(state, 1, at(1))
    expect(countsOf(state)).toEqual({})
    expect(state.orders[0]).toMatchObject({ cancelledAt: at(1).toISOString(), closedAt: at(1).toISOString() })
    expect(openOrder(state, at(1.5))).toBeNull()

    state = restoreOrder(state, 1, at(2))
    expect(countsOf(state)).toEqual({ a: 1, b: 1 })
    expect(state.orders[0]!.cancelledAt).toBeNull()
    // 閉じたまま（戻したあとに押した分は、新しいオーダーになる）
    expect(addItem(state, 'a', at(2.5)).orders).toHaveLength(2)
  })

  it('取り消し済みをもう一度取り消しても、取り消していないものを戻しても、何もしない', () => {
    const cancelled = cancelOrder(press(initialState(), ['a', 0]), 1, at(1))
    expect(cancelOrder(cancelled, 1, at(2))).toBe(cancelled)
    const live = press(initialState(), ['a', 0])
    expect(restoreOrder(live, 1, at(1))).toBe(live)
  })
})

describe('revertEdit（この変更の前に戻す）', () => {
  it('直す前の中身に戻し、戻したことも記録に残す（戻したあとでも、また戻せる）', () => {
    let state = press(initialState(), ['a', 0], ['a', 0])
    state = editOrder(state, 1, { a: 1, b: 1 }, at(10))
    state = revertEdit(state, 1, 0, at(11))
    const order = state.orders[0]!
    expect(order.lines).toEqual({ a: 2 })
    expect(order.edits).toEqual([
      { at: at(10).toISOString(), before: { a: 2 } },
      { at: at(11).toISOString(), before: { a: 1, b: 1 } },
    ])
    expect(revertEdit(state, 1, 1, at(12)).orders[0]!.lines).toEqual({ a: 1, b: 1 })
  })

  it('ない記録なら何もしない', () => {
    const state = press(initialState(), ['a', 0])
    expect(revertEdit(state, 1, 0, at(1))).toBe(state)
  })
})
