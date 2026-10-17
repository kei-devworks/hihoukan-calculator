/**
 * 引き継ぎ（交代・休憩）の計算（DOM に触れない）。前の人の数を QR・リンク・報告文から読み、
 * この端末の数を置き換える（ゼロから引き継ぐ）か、足りない分だけ足す（休憩から戻った）。docs/architecture.md
 */

import { clearCashCount, type CoinCounts } from './cash'
import type { HandoverCode } from './handover-code'
import { cleanLines, openOrder, pieces, type Order, type OrderLines } from './orders'
import {
  allItems,
  carriedOverSince,
  countsOf,
  grandTotal,
  itemsOf,
  linesTotal,
  normalizeCustomName,
  reportName,
  sectionsOf,
  type Counts,
  type CustomItem,
  type TallyConfig,
  type TallySection,
  type TallyState,
} from './tally'
import { formatTime } from './time'

/** zero: ゼロから引き継ぐ（この端末の数を置き換える）。back: 休憩から戻った（足りない分だけ足す） */
export type HandoverMode = 'zero' | 'back'

/** 前の人の数（QR・リンク・報告文から読んだもの）。品目の id はこの端末のものにしてある */
export type HandoverInput = {
  /** 前の人の数の時刻（QR を出した時刻・報告文の「◯時点」）。わからなければ null */
  at: string | null
  counts: Counts
  /** 前の人の合計（照合用）。わからなければ null */
  total: number | null
  /** この端末にない、前の人が足した品目。引き継ぐときに足す */
  newItems: CustomItem[]
  /** 釣り銭準備金の開店時の枚数（QR・リンクだけ） */
  floatStart: CoinCounts | null
  /** 読めなかった行・この端末の設定にない品目 */
  unknown: string[]
}

/** QR を出す時点の、この端末の数（足した品目と、釣り銭準備金の開店時の枚数も入れる） */
export function makeHandoverCode(config: TallyConfig, state: TallyState, now: Date): HandoverCode {
  return {
    v: 1,
    // 秒より細かい時刻は要らない（QR を小さくする）
    at: new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z'),
    counts: cleanLines(countsOf(state)),
    custom: state.customItems.map((c) => ({ i: c.id, s: c.sectionId, n: c.name, p: c.price })),
    floatStart: { ...state.cash.floatStart },
    total: grandTotal(config, state),
  }
}

/**
 * QR・リンクのデータを、この端末の品目に合わせる。足した品目は id、なければ見出し・名前・単価が同じものに合わせ、
 * どちらもなければ新しい品目として足す（id は前の人のものを使うので、次に引き継ぐときも同じ品目になる）
 */
export function inputFromCode(config: TallyConfig, state: TallyState, code: HandoverCode): HandoverInput {
  const sectionIds = new Set(config.sections.map((s) => s.id))
  const configIds = new Set(allItems(config).map((i) => i.id))
  const idMap = new Map<string, string>()
  const newItems: CustomItem[] = []
  const unknown: string[] = []
  for (const c of code.custom) {
    const name = c.n === null ? null : normalizeCustomName(c.n)
    if (!sectionIds.has(c.s)) {
      if ((code.counts[c.i] ?? 0) > 0) unknown.push(`${name ?? `${c.p}円`}（この端末にない見出し）`)
      continue
    }
    const local =
      state.customItems.find((x) => x.id === c.i) ??
      state.customItems.find((x) => x.sectionId === c.s && x.name === name && x.price === c.p)
    if (local) {
      idMap.set(c.i, local.id)
    } else {
      newItems.push({ id: c.i, sectionId: c.s, name, price: c.p })
      idMap.set(c.i, c.i)
    }
  }
  const counts: Counts = {}
  for (const [id, n] of Object.entries(code.counts)) {
    const local = configIds.has(id) ? id : idMap.get(id)
    if (local) counts[local] = (counts[local] ?? 0) + n
    else if (!code.custom.some((c) => c.i === id)) unknown.push(`この端末の設定にない品目（${id}）`)
  }
  return { at: code.at, counts, total: code.total, newItems, floatStart: { ...code.floatStart }, unknown }
}

/** 見出しの「◾️肉」と「◾肉」のような、見た目が同じ書き方のちがいを無視して比べる */
const plain = (text: string) => text.replace(/[️\s]/g, '')

/**
 * 報告文を読む。見出しの下の「1,000×3」「ホタテ×2」を、その見出しの品目に合わせる。
 * 名前のない値段だけの行（「7,000×1」）でこの端末にない値段なら、新しい品目として足す。
 * 報告文らしい行が1つもなければ null
 */
export function inputFromReport(config: TallyConfig, state: TallyState, text: string, now: Date): HandoverInput | null {
  const sections = sectionsOf(config, state)
  let current: TallySection | null = null
  let time: string | null = null
  let total: number | null = null
  let recognized = 0
  const counts: Counts = {}
  const newItems: CustomItem[] = []
  const unknown: string[] = []
  const base = `x-${now.getTime().toString(36)}`

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || plain(line) === plain(config.reportTitle)) continue
    let m = line.match(/^(\d{1,2}):(\d{2})時点$/)
    if (m) {
      time = `${m[1]!.padStart(2, '0')}:${m[2]}`
      recognized++
      continue
    }
    const section = sections.find((s) => plain(s.title) === plain(line))
    if (section) {
      current = section
      recognized++
      continue
    }
    if (/^小計[￥¥][\d,]+-?$/.test(line)) continue
    m = line.match(/^合計[￥¥]([\d,]+)-?$/)
    if (m) {
      total = Number(m[1]!.replace(/,/g, ''))
      recognized++
      continue
    }
    m = line.match(/^(.+?)\s*[×xX＊*]\s*(\d+)$/)
    if (m && current) {
      const name = plain(m[1]!)
      const n = Number(m[2])
      const item = current.items.find((i) => plain(reportName(config, state, i)) === name)
      if (item) {
        counts[item.id] = (counts[item.id] ?? 0) + n
        recognized++
        continue
      }
      if (/^[\d,]+$/.test(name) && Number(name.replace(/,/g, '')) > 0) {
        // 値段だけの品目で、この端末にない値段（前の人が足した品目）
        const price = Number(name.replace(/,/g, ''))
        let added = newItems.find((c) => c.sectionId === current!.id && c.name === null && c.price === price)
        if (!added) {
          added = { id: `${base}-${newItems.length + 1}`, sectionId: current.id, name: null, price }
          newItems.push(added)
        }
        counts[added.id] = (counts[added.id] ?? 0) + n
        recognized++
        continue
      }
    }
    unknown.push(line)
  }
  if (recognized === 0) return null
  return { at: time === null ? null : reportTimeNear(time, now).toISOString(), counts, total, newItems, floatStart: null, unknown }
}

/** 報告文の「21:00時点」を、いまにいちばん近いその時刻にする（日付をまたいだ深夜の報告も） */
function reportTimeNear(time: string, now: Date): Date {
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm)
  const half = 12 * 60 * 60_000
  if (at.getTime() - now.getTime() > half) at.setDate(at.getDate() - 1)
  else if (now.getTime() - at.getTime() > half) at.setDate(at.getDate() + 1)
  return at
}

/** 前の人が足した品目を、この端末の品目に足す（もうあれば足さない） */
export function withNewItems(state: TallyState, items: readonly CustomItem[]): TallyState {
  const add = items.filter((c) => !state.customItems.some((x) => x.id === c.id))
  return add.length === 0 ? state : { ...state, customItems: [...state.customItems, ...add] }
}

export type HandoverLine = {
  itemId: string
  /** 前の人の数 */
  prev: number
  /** この端末の数 */
  local: number
  /** 引き継ぎで入れる数 */
  add: number
  /** 引き継いだあとの数 */
  after: number
}

export type HandoverPlan = {
  /** 品目ごと（見出しの順。前の人が足した品目も含む） */
  lines: HandoverLine[]
  prevPieces: number
  /** 前の人の数を、この端末の単価で計算した合計 */
  prevTotal: number
  /** この端末の数（ゼロから引き継ぐときは取り消す） */
  localPieces: number
  localTotal: number
  /** 引き継ぎとして1件に記録する中身 */
  addLines: OrderLines
  addPieces: number
  addTotal: number
  /** 引き継いだあとの合計 */
  afterTotal: number
  /** 休憩から戻ったときに、この端末のほうが多い品目（減らさない） */
  more: HandoverLine[]
}

/** 引き継ぐと、品目ごとにいくつ入るか。state には前の人が足した品目を足しておく（withNewItems） */
export function planHandover(config: TallyConfig, state: TallyState, counts: Counts, mode: HandoverMode): HandoverPlan {
  const localCounts = countsOf(state)
  const lines = itemsOf(config, state).map((item): HandoverLine => {
    const prev = counts[item.id] ?? 0
    const local = localCounts[item.id] ?? 0
    const add = mode === 'zero' ? prev : Math.max(0, prev - local)
    return { itemId: item.id, prev, local, add, after: mode === 'zero' ? prev : Math.max(prev, local) }
  })
  const sum = (key: 'prev' | 'local' | 'add' | 'after') => Object.fromEntries(lines.filter((l) => l[key] > 0).map((l) => [l.itemId, l[key]]))
  const addLines = sum('add')
  return {
    lines,
    prevPieces: pieces(sum('prev')),
    prevTotal: linesTotal(config, state, sum('prev')),
    localPieces: pieces(sum('local')),
    localTotal: linesTotal(config, state, sum('local')),
    addLines,
    addPieces: pieces(addLines),
    addTotal: linesTotal(config, state, addLines),
    afterTotal: linesTotal(config, state, sum('after')),
    more: mode === 'back' ? lines.filter((l) => l.local > l.prev) : [],
  }
}

/** 記録の一覧に出す、引き継ぎの出どころ（「前の人の 16:42時点の数」） */
export function handoverSourceText(mode: HandoverMode, at: string | null): string {
  const when = at === null ? null : `${formatTime(new Date(at))}時点`
  if (mode === 'zero') return when ? `前の人の ${when}の数` : '前の人の数（打ち込み）'
  return when ? `休憩のあいだに増えた分（${when}）` : '休憩のあいだに増えた分（打ち込み）'
}

/**
 * 引き継ぐ。前の人の数を、お客さんのオーダーとは別の「引き継ぎ」1件として記録する（今のオーダーには入れない）。
 * - ゼロから引き継ぐ: この端末の今日の記録は取り消し済みにして残し（元に戻せる）、前の人の数に置き換える。
 *   前の営業日の記録は消す。レジ精算の枚数は消し、釣り銭準備金の開店時の枚数は前の人のものにする
 * - 休憩から戻った: この端末の数は残し、足りない分だけ足す（同じデータを2回入れても二重にならない）。
 *   釣り銭準備金の開店時の枚数は、この端末に入っていなければ前の人のものを入れる
 */
export function applyHandover(
  config: TallyConfig,
  state: TallyState,
  input: Pick<HandoverInput, 'at' | 'counts' | 'newItems' | 'floatStart'>,
  mode: HandoverMode,
  now: Date,
): TallyState {
  const at = now.toISOString()
  let next = withNewItems(state, input.newItems)
  const plan = planHandover(config, next, input.counts, mode)
  const floatStart = input.floatStart && Object.keys(input.floatStart).length > 0 ? input.floatStart : null

  if (mode === 'zero') {
    const carried = carriedOverSince(config, next, now) !== null
    const orders = carried
      ? []
      : next.orders.map((o) => (o.cancelledAt === null ? { ...o, closedAt: o.closedAt ?? at, cancelledAt: at } : o))
    const cash = clearCashCount(next.cash)
    next = { ...next, orders, cash: floatStart ? { ...cash, floatStart: { ...floatStart } } : cash }
  } else {
    if (plan.addPieces === 0) return state
    // 押している途中のオーダーは閉じる（引き継ぎのあとに押した分は、新しいオーダーになる）
    const open = openOrder(next, now)
    const orders = open ? next.orders.map((o) => (o.id === open.id ? { ...o, closedAt: at } : o)) : next.orders
    const keepFloat = Object.keys(next.cash.floatStart).length > 0
    next = { ...next, orders, cash: floatStart && !keepFloat ? { ...next.cash, floatStart: { ...floatStart } } : next.cash }
  }

  if (plan.addPieces > 0) {
    // QR の時刻は秒までなので、保存のほかの時刻と同じ書き方にそろえる
    const when = input.at === null ? at : new Date(input.at).toISOString()
    const order: Order = {
      id: next.orders.reduce((max, o) => Math.max(max, o.id), 0) + 1,
      kind: 'handover',
      openedAt: when,
      lastAt: when,
      closedAt: when,
      lines: plan.addLines,
      tenders: [],
      edits: [],
      cancelledAt: null,
      source: handoverSourceText(mode, input.at),
    }
    next = { ...next, orders: [...next.orders, order] }
  }
  return { ...next, updatedAt: at }
}
