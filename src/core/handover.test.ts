import { describe, expect, it } from 'vitest'
import { setCashCount } from './cash'
import { sampleConfig as config, stateWithCounts } from './fixtures'
import {
  applyHandover,
  handoverSourceText,
  inputFromCode,
  inputFromReport,
  makeHandoverCode,
  planHandover,
  withNewItems,
} from './handover'
import { decodeHandoverCode, handoverLink } from './handover-code'
import { addItem, cancelOrder, closeOrder, liveOrders, openOrder } from './orders'
import { buildSalesReport } from './report'
import { addCustomItem, countsOf, grandTotal, initialState, type TallyState } from './tally'

const at = (hhmm: string, day = 17) => new Date(`2026-10-${day}T${hhmm}:00+09:00`)
const page = 'https://kei-devworks.github.io/hihoukan-calculator/sample/'

/** 品目を順に押して、オーダーを閉じた状態（1品目ずつ別のお客さん） */
function sold(state: TallyState, items: Record<string, number>, when: Date): TallyState {
  let s = state
  for (const [id, n] of Object.entries(items)) {
    for (let i = 0; i < n; i++) s = addItem(s, id, when)
    s = closeOrder(s, s.orders.at(-1)!.id, when)
  }
  return s
}

/** 前の人の端末: 串A×5・ホタテ×2・バニラ×3、足した品目（チョコ 100円）×4、釣り銭準備金の開店時 500円×10 */
function senderState(): TallyState {
  let s = addCustomItem(initialState(), 'soft', 'チョコ', 100, at('12:00'))
  const choco = s.customItems[0]!.id
  s = sold(s, { a: 5, hotate: 2, vanilla: 3, [choco]: 4 }, at('15:10'))
  // 取り消したオーダーは渡さない
  s = addItem(s, 'b', at('15:20'))
  s = cancelOrder(s, s.orders.at(-1)!.id, at('15:21'))
  return { ...s, cash: setCashCount(s.cash, 'floatStart', 500, 10) }
}

describe('makeHandoverCode', () => {
  it('取り消していない数・足した品目・釣り銭準備金の開店時の枚数・合計を入れる', () => {
    const s = senderState()
    const choco = s.customItems[0]!.id
    expect(makeHandoverCode(config, s, new Date('2026-10-17T07:42:31.456Z'))).toEqual({
      v: 1,
      at: '2026-10-17T07:42:31Z',
      counts: { a: 5, hotate: 2, vanilla: 3, [choco]: 4 },
      custom: [{ i: choco, s: 'soft', n: 'チョコ', p: 100 }],
      floatStart: { '500': 10 },
      total: 5000 + 2000 + 2400 + 400,
    })
  })
})

describe('QR・リンクで引き継ぐ', () => {
  it('ゼロから引き継ぐと、次の人の端末の数・報告文・足した品目・準備金が前の人と同じになる', () => {
    const sender = senderState()
    const link = handoverLink(page, makeHandoverCode(config, sender, at('16:42')))
    const code = decodeHandoverCode(link)!
    const input = inputFromCode(config, initialState(), code)
    expect(input.newItems).toHaveLength(1)
    expect(input.unknown).toEqual([])

    const receiver = applyHandover(config, initialState(), input, 'zero', at('16:45'))
    expect(countsOf(receiver)).toEqual(countsOf(sender))
    expect(buildSalesReport(config, receiver, '17:00')).toBe(buildSalesReport(config, sender, '17:00'))
    expect(receiver.customItems).toEqual(sender.customItems)
    expect(receiver.cash.floatStart).toEqual({ '500': 10 })
    // お客さんのオーダーとは別の「引き継ぎ」1件。時刻は前の人が QR を出した時刻
    expect(receiver.orders).toHaveLength(1)
    expect(receiver.orders[0]).toMatchObject({
      kind: 'handover',
      openedAt: at('16:42').toISOString(),
      source: '前の人の 16:42時点の数',
    })
  })

  it('足した品目は、id か、見出し・名前・単価が同じこの端末の品目に合わせる。ないものだけ足す', () => {
    const sender = senderState()
    const code = makeHandoverCode(config, sender, at('16:42'))
    const choco = sender.customItems[0]!.id

    // 前にも引き継いで、同じ id の品目がある
    const sameId = inputFromCode(config, withNewItems(initialState(), sender.customItems), code)
    expect(sameId.newItems).toEqual([])
    expect(sameId.counts[choco]).toBe(4)

    // 自分で同じ品目を足していた（id はちがう）
    const own = addCustomItem(initialState(), 'soft', 'チョコ', 100, at('10:00'))
    const sameName = inputFromCode(config, own, code)
    expect(sameName.newItems).toEqual([])
    expect(sameName.counts[own.customItems[0]!.id]).toBe(4)
    expect(sameName.counts[choco]).toBeUndefined()
  })

  it('この端末の設定にない品目・見出しは入れずに知らせる', () => {
    const code = { ...makeHandoverCode(config, senderState(), at('16:42')) }
    code.counts = { ...code.counts, kushi9: 2, 'x-zzz': 1 }
    code.custom = [...code.custom, { i: 'x-zzz', s: 'drink', n: 'ラムネ', p: 300 }]
    const input = inputFromCode(config, initialState(), code)
    expect(input.counts.kushi9).toBeUndefined()
    expect(input.counts['x-zzz']).toBeUndefined()
    expect(input.unknown).toEqual(['ラムネ（この端末にない見出し）', 'この端末の設定にない品目（kushi9）'])
  })
})

describe('ゼロから引き継ぐ', () => {
  it('この端末の今日の記録は取り消し済みにして残し（元に戻せる）、前の人の数に置き換える', () => {
    let local = sold(initialState(), { a: 1, matcha: 2 }, at('16:30'))
    local = { ...local, cash: setCashCount(setCashCount(local.cash, 'pocket', 1000, 3), 'floatStart', 100, 5) }
    const input = { at: at('16:42').toISOString(), counts: { a: 5, hotate: 2 }, newItems: [], floatStart: { '500': 10 } }

    const plan = planHandover(config, local, input.counts, 'zero')
    expect(plan).toMatchObject({ localPieces: 3, localTotal: 2600, addPieces: 7, afterTotal: 7000 })

    const next = applyHandover(config, local, input, 'zero', at('16:45'))
    expect(countsOf(next)).toEqual({ a: 5, hotate: 2 })
    expect(next.orders.filter((o) => o.kind === 'order').every((o) => o.cancelledAt !== null)).toBe(true)
    expect(next.orders).toHaveLength(3)
    expect(next.cash.pocket).toEqual({})
    expect(next.cash.floatStart).toEqual({ '500': 10 })
  })

  it('前の営業日の記録は残さない', () => {
    const local = stateWithCounts({ a: 9 }, at('20:00', 16))
    const next = applyHandover(config, local, { at: null, counts: { a: 1 }, newItems: [], floatStart: null }, 'zero', at('16:45'))
    expect(next.orders).toHaveLength(1)
    expect(next.orders[0]).toMatchObject({ kind: 'handover', openedAt: at('16:45').toISOString(), source: '前の人の数（打ち込み）' })
  })

  it('準備金のデータがなければ（報告文・打ち込み）、この端末の開店時の枚数を残す', () => {
    const local = { ...initialState(), cash: setCashCount(initialState().cash, 'floatStart', 100, 5) }
    const next = applyHandover(config, local, { at: null, counts: { a: 1 }, newItems: [], floatStart: null }, 'zero', at('16:45'))
    expect(next.cash.floatStart).toEqual({ '100': 5 })
  })
})

describe('休憩から戻った', () => {
  const local = sold(initialState(), { a: 3, hotate: 2 }, at('14:00'))
  const input = { at: at('15:00').toISOString(), counts: { a: 5, hotate: 1, vanilla: 2 }, newItems: [], floatStart: { '500': 10 } }

  it('この端末の数は残し、足りない分だけ足す。この端末のほうが多い品目は減らさない', () => {
    const plan = planHandover(config, local, input.counts, 'back')
    expect(plan.addLines).toEqual({ a: 2, vanilla: 2 })
    expect(plan.more.map((l) => l.itemId)).toEqual(['hotate'])
    expect(plan.afterTotal).toBe(5000 + 2000 + 1600)

    const next = applyHandover(config, local, input, 'back', at('15:05'))
    expect(countsOf(next)).toEqual({ a: 5, hotate: 2, vanilla: 2 })
    expect(grandTotal(config, next)).toBe(plan.afterTotal)
    expect(next.orders.at(-1)).toMatchObject({ kind: 'handover', lines: { a: 2, vanilla: 2 }, source: '休憩のあいだに増えた分（15:00時点）' })
    // 今日の自分の記録はそのまま
    expect(liveOrders(next).filter((o) => o.kind === 'order')).toHaveLength(2)
  })

  it('同じデータをもう一度入れても二重にならない', () => {
    const once = applyHandover(config, local, input, 'back', at('15:05'))
    expect(applyHandover(config, once, input, 'back', at('15:06'))).toBe(once)
  })

  it('押している途中のオーダーは閉じ、引き継ぎのあとに押した分は新しいオーダーになる', () => {
    const pressing = addItem(local, 'matcha', at('15:04'))
    const next = applyHandover(config, pressing, input, 'back', at('15:05'))
    expect(openOrder(next, at('15:05'))).toBeNull()
    const after = addItem(next, 'matcha', at('15:06'))
    expect(after.orders.at(-1)).toMatchObject({ kind: 'order', lines: { matcha: 1 } })
  })

  it('釣り銭準備金の開店時の枚数は、この端末に入っていなければ入れる', () => {
    expect(applyHandover(config, local, input, 'back', at('15:05')).cash.floatStart).toEqual({ '500': 10 })
    const own = { ...local, cash: setCashCount(local.cash, 'floatStart', 100, 3) }
    expect(applyHandover(config, own, input, 'back', at('15:05')).cash.floatStart).toEqual({ '100': 3 })
  })
})

describe('報告文から読む', () => {
  it('このページの報告文を読むと、同じ数・合計・時刻になる', () => {
    const sender = sold(initialState(), { a: 3, b: 1, hotate: 2, vanilla: 1, matcha: 4 }, at('20:40'))
    const text = buildSalesReport(config, sender, '21:00')
    const input = inputFromReport(config, initialState(), text, at('21:03'))!
    expect(input.counts).toEqual(countsOf(sender))
    expect(input.total).toBe(grandTotal(config, sender))
    expect(input.at).toBe(at('21:00').toISOString())
    expect(input.unknown).toEqual([])
    expect(input.newItems).toEqual([])
  })

  it('値段だけのこの端末にない品目は、その見出しに足す品目にする。名前のある知らない品目は読めなかった行にする', () => {
    const text = '売上報告\n17:00時点\n\n◾️肉\n1,000×2\n7,000×1\n小計￥9,000-\n\n◾️ソフト\nバニラ×1\nチョコ×3\n小計￥800-\n\n合計￥9,800-'
    const input = inputFromReport(config, initialState(), text, at('17:05'))!
    expect(input.newItems).toEqual([{ id: expect.stringMatching(/^x-/), sectionId: 'meat', name: null, price: 7000 }])
    expect(input.counts).toEqual({ a: 2, vanilla: 1, [input.newItems[0]!.id]: 1 })
    expect(input.unknown).toEqual(['チョコ×3'])
    expect(input.total).toBe(9800)
  })

  it('見出しの書き方のちがい（◾️ と ◾）や、行の前後の空白は気にしない', () => {
    const input = inputFromReport(config, initialState(), '  ◾肉 \n ホタテ × 2\n', at('17:05'))!
    expect(input.counts).toEqual({ hotate: 2 })
    expect(input.at).toBeNull()
  })

  it('深夜の報告は、いまにいちばん近い日の時刻にする', () => {
    expect(inputFromReport(config, initialState(), '23:00時点', at('00:20', 18))!.at).toBe(at('23:00', 17).toISOString())
    expect(inputFromReport(config, initialState(), '00:00時点', at('23:50', 17))!.at).toBe(at('00:00', 18).toISOString())
  })

  it('報告文らしい行がなければ null', () => {
    expect(inputFromReport(config, initialState(), 'よろしくお願いします', at('17:05'))).toBeNull()
    expect(inputFromReport(config, initialState(), '', at('17:05'))).toBeNull()
  })
})

describe('handoverSourceText', () => {
  it('記録の一覧に出す出どころ', () => {
    expect(handoverSourceText('zero', at('16:42').toISOString())).toBe('前の人の 16:42時点の数')
    expect(handoverSourceText('back', null)).toBe('休憩のあいだに増えた分（打ち込み）')
  })
})
