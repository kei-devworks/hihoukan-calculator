import './tally.css'
import { formatNumber, formatPrice, formatYen } from '../core/format'
import type { SaveResult } from '../core/json-store'
import { buildSalesReport } from '../core/report'
import { openLocalStorage, type KeyValueStorage } from '../core/storage'
import {
  addItem,
  cancelOrder,
  closeOrder,
  editOrder,
  findOrder,
  openOrder,
  ORDER_IDLE_MS,
  removeItem,
  revertEdit,
  type Order,
} from '../core/orders'
import {
  carriedOverSince,
  countOf,
  displayName,
  grandTotal,
  linesTotal,
  priceOf,
  resetCounts,
  resetPrices,
  sectionTotal,
  setPrice,
  type TallyConfig,
  type TallyState,
} from '../core/tally'
import { TallyStore } from '../core/tally-store'
import { formatMonthDayTime, formatTime, nearestHour } from '../core/time'
import { copyText, selectContents } from './clipboard'
import { h } from './dom'
import { holdButton } from './hold-button'
import { noticeBar } from './notice-bar'
import { describeChanges, openOrderEditor } from './order-editor'
import { orderPanel } from './order-panel'
import { viewTabs } from './view-tabs'
import { keepFresh, pageHeader, pageStatus } from './page-parts'

export type MountOptions = {
  /** 保存先。省略すると端末の localStorage（使えなければ保存しない） */
  storage?: KeyValueStorage | null
  /** いまの時刻。テストで差し替える */
  now?: () => Date
}

export type TallyApp = {
  store: TallyStore
  /** タイマーとイベントを外す（テスト用） */
  unmount: () => void
}

/**
 * 「個数 × 単価」のページを root の中に組み立てる。
 * 画面は設定から作り、状態が変わるたびに render() で表示を合わせる（docs/architecture.md）
 */
export function mountTallyApp(root: HTMLElement, config: TallyConfig, options: MountOptions = {}): TallyApp {
  const now = options.now ?? (() => new Date())
  const store = new TallyStore(config, options.storage === undefined ? openLocalStorage() : options.storage)
  let lastSave: SaveResult | null = null
  /** 報告時刻を手で変えたか。変えていなければ、時間がたつといまの時刻に合わせ直す */
  let timeEdited = false
  /** 今のオーダーが閉じる時刻に描き直すためのタイマー */
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  // ---- 見出し・報告時刻・保存の状態 ----
  const timeInput = h('input', { type: 'time', id: 'report-time' })
  const nowButton = h('button', { type: 'button', class: 'ghost', text: '今' })
  const status = pageStatus({
    dayStartHour: config.dayStartHour,
    idleText: '数えた数はこの端末に自動で保存されます',
    carriedText: (since) =>
      `${formatMonthDayTime(since)} から数えた数字が残っています。今日の集計を始めるときは 0 に戻してください。`,
    carriedActions: [
      {
        label: '0 に戻して今日を始める',
        armedLabel: '長押しで全部 0 にする',
        hold: true,
        onConfirm: () => change(resetCounts(store.current), '全部 0 にしました'),
      },
    ],
  })

  // ---- 品目の行と小計 ----
  const rows = config.sections.flatMap((section) =>
    section.items.map((item) => ({
      item,
      name: h('span', { class: 'nm' }),
      priceTag: item.name ? h('span', { class: 'pr' }) : null,
      count: h('span', { class: 'n' }),
      minus: h('button', { type: 'button', class: 'step', text: '−' }),
      plus: h('button', { type: 'button', class: 'step', text: '＋' }),
    })),
  )
  const addOne = (itemId: string) => {
    orders.touch(itemId)
    change(addItem(store.current, itemId, now()))
  }
  const removeOne = (itemId: string) => {
    const item = rows.find((row) => row.item.id === itemId)?.item
    if (!item) return
    orders.touch(itemId)
    const name = displayName(config, store.current, item)
    const { state, from, fromOpen } = removeItem(store.current, itemId, now())
    if (!from) return
    // 今のオーダーの押しまちがいはその場で見えるので知らせない。前のオーダーから減らしたときは、どこから減ったかを知らせる
    const where = from.kind === 'handover' ? 'まとめて入れた数' : 'オーダー'
    change(state, fromOpen ? undefined : `${formatTime(new Date(from.openedAt))} の${where}から${name}を1つ減らしました`)
  }
  for (const row of rows) {
    row.minus.addEventListener('click', () => removeOne(row.item.id))
    row.plus.addEventListener('click', () => addOne(row.item.id))
  }

  const subtotals = config.sections.map((section) => ({ section, value: h('span') }))
  const sectionCards = config.sections.map((section, i) =>
    h('section', { class: i % 2 === 0 ? 'card' : 'card alt', 'data-section': section.id }, [
      h('h2', { text: section.title }),
      ...rows
        .filter((row) => section.items.includes(row.item))
        .map((row) =>
          h('div', { class: 'row', 'data-item': row.item.id }, [
            h('div', { class: 'label' }, row.priceTag ? [row.name, row.priceTag] : [row.name]),
            h('div', { class: 'ctrl' }, [row.minus, row.count, row.plus]),
          ]),
        ),
      h('div', { class: 'sub' }, [h('span', { text: '小計' }), subtotals[i]!.value]),
    ]),
  )

  const total = h('b', { id: 'total' })

  // ---- 単価設定 ----
  const priceFields = config.prices.map((def) => ({
    def,
    input: h('input', {
      type: 'number',
      id: `price-${def.id}`,
      inputmode: 'numeric',
      min: 0,
      step: 10,
      enterkeyhint: 'done',
    }),
    hint: h('span', { class: 'default-hint' }),
  }))
  for (const { def, input } of priceFields) {
    input.addEventListener('input', () => {
      // 打ち直しの途中で空になっても 0 円にはしない
      if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) return
      change(setPrice(config, store.current, def.id, input.valueAsNumber))
    })
    input.addEventListener('blur', () => {
      input.value = String(priceOf(config, store.current, def.id))
    })
  }
  const pricesTitle = h('h2', { id: 'prices-title' })
  const resetPricesButton = h('button', { type: 'button', class: 'ghost', text: 'すべて既定に戻す' })
  resetPricesButton.addEventListener('click', () => change(resetPrices(store.current)))

  // ---- 報告文 ----
  const report = h('pre', { class: 'report', id: 'report' })
  const copyButton = h('button', { type: 'button', class: 'solid', text: 'コピー' })
  const resetButton = holdButton({
    label: 'リセット',
    armedLabel: '長押しで全部 0 にする',
    onConfirm: () => change(resetCounts(store.current), '全部 0 にしました'),
  })

  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const flashCopy = (text: string, ms: number) => {
    clearTimeout(copyTimer)
    copyButton.textContent = text
    copyTimer = setTimeout(() => (copyButton.textContent = 'コピー'), ms)
  }
  copyButton.addEventListener('click', async () => {
    if (await copyText(report.textContent ?? '')) {
      flashCopy('コピーしました', 1600)
    } else {
      selectContents(report)
      flashCopy('選択したので長押しでコピー', 2600)
    }
  })

  // ---- 画面の下に重ねて出すもの（お知らせ・今のオーダー） ----
  const notice = noticeBar()
  const orderTime = (order: Order) => formatTime(new Date(order.openedAt))
  const cancelOne = (id: number) => {
    const order = findOrder(store.current, id)
    if (!order) return
    const price = formatPrice(linesTotal(config, store.current, order.lines))
    change(cancelOrder(store.current, id, now()), `${orderTime(order)} のオーダー（${price}）を取り消しました`)
  }
  const editOne = (id: number) =>
    openOrderEditor(config, store.current, id, {
      save: (orderId, lines) => {
        const order = findOrder(store.current, orderId)
        if (!order) return
        const changes = describeChanges(config, store.current, order.lines, lines)
        change(editOrder(store.current, orderId, lines, now()), `${orderTime(order)} のオーダーを変更しました（${changes}）`)
      },
      cancel: cancelOne,
      revert: (orderId, index) => {
        const order = findOrder(store.current, orderId)
        if (!order) return
        change(revertEdit(store.current, orderId, index, now()), `${orderTime(order)} のオーダーを変更の前に戻しました`)
      },
    })
  const orders = orderPanel(config, {
    add: addOne,
    remove: removeOne,
    complete: (id) => change(closeOrder(store.current, id, now())),
    cancel: cancelOne,
    edit: editOne,
    showCount: () => tabs.select('count'),
  })
  const dock = h('div', { class: 'dock' }, [notice.element, orders.element])
  // 下に重ねたものの高さだけ、ページの下に余白を足す（いちばん下の行やボタンが隠れないように）
  const syncDockSpace = () => {
    root.style.paddingBottom = dock.offsetHeight > 0 ? `calc(max(40px, env(safe-area-inset-bottom, 0px)) + ${dock.offsetHeight}px)` : ''
  }
  const dockObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncDockSpace) : null
  dockObserver?.observe(dock)

  // ---- 画面の切り替え ----
  // 「数える」はいつも使う画面（今と同じ並び）。ほかは見出しの下のボタンで切り替え、縦に長くしない
  const countPanel = h('div', { class: 'view-panel' }, [
    ...sectionCards,
    h('div', { class: 'total' }, [h('span', { text: '合計' }), total]),
    h('section', { class: 'card' }, [
      h('div', { class: 'rhead' }, [h('h2', { text: '報告文' }), copyButton]),
      report,
      h('div', { class: 'foot' }, [resetButton]),
    ]),
  ])
  const itemsPanel = h('div', { class: 'view-panel' }, [
    h('section', { class: 'card prices' }, [
      pricesTitle,
      h(
        'div',
        { class: 'pgrid' },
        priceFields.flatMap(({ input, def, hint }) => [h('label', { for: input.id }, [def.label, hint]), input]),
      ),
      h('div', { class: 'foot' }, [resetPricesButton]),
    ]),
  ])
  const tabs = viewTabs(
    [
      { id: 'count', label: '数える', panel: countPanel },
      { id: 'items', label: '品目', panel: itemsPanel },
    ],
    {
      label: '画面の切り替え',
      onChange: () => {
        window.scrollTo({ top: 0 })
        render()
      },
    },
  )

  root.replaceChildren(
    pageHeader(config.title, [
      h('div', { class: 'timebar' }, [h('label', { for: timeInput.id, text: '報告時刻' }), timeInput, nowButton]),
      status.saveStatus,
    ]),
    status.storageWarning,
    status.carriedNotice,
    tabs.element,
    countPanel,
    itemsPanel,
    dock,
  )

  // ---- 状態の変更と描画 ----
  /**
   * 状態を変えて保存し、描き直す。undoText を渡すと、変える前に戻せる知らせを出す。
   * ほかの操作をしたら知らせは消す（戻す先が古くなり、あとの操作まで消えてしまうため）
   */
  function change(next: TallyState, undoText?: string) {
    const before = store.current
    if (undoText) {
      notice.show(undoText, () => {
        lastSave = store.update(before)
        render()
      })
    } else {
      notice.hide()
    }
    lastSave = store.update(next)
    render()
  }

  function render() {
    const state = store.current
    const at = now()

    for (const row of rows) {
      const name = displayName(config, state, row.item)
      const n = countOf(state, row.item.id)
      row.name.textContent = name
      if (row.priceTag) row.priceTag.textContent = `¥${formatNumber(priceOf(config, state, row.item.priceId))}`
      row.count.textContent = String(n)
      row.count.classList.toggle('zero', n === 0)
      row.minus.setAttribute('aria-label', `${name}を1つ減らす`)
      row.plus.setAttribute('aria-label', `${name}を1つ増やす`)
    }
    for (const { section, value } of subtotals) value.textContent = formatYen(sectionTotal(config, state, section))
    total.textContent = formatYen(grandTotal(config, state))
    // 変わったときだけ書き換える（長押しコピー用に選択した範囲が、定期の描き直しで消えないように）
    const reportText = buildSalesReport(config, state, timeInput.value || nearestHour(at))
    if (report.textContent !== reportText) report.textContent = reportText

    let changedPrices = 0
    for (const { def, input, hint } of priceFields) {
      const price = priceOf(config, state, def.id)
      const changed = price !== def.default
      if (changed) changedPrices++
      // 入力中の欄は書き換えない（打っている途中の値を消さないように）
      if (document.activeElement !== input) input.value = String(price)
      hint.textContent = changed ? `（既定 ¥${formatNumber(def.default)}）` : ''
      input.classList.toggle('changed', changed)
    }
    pricesTitle.textContent = changedPrices > 0 ? `単価設定（${changedPrices}件 変更あり）` : '単価設定'
    resetPricesButton.disabled = changedPrices === 0

    status.update({
      available: store.available,
      lastSave,
      updatedAt: state.updatedAt,
      carriedSince: carriedOverSince(config, state, at),
      now: at,
    })

    orders.render(state, at, tabs.current === 'count')
    // 今のオーダーが3分で閉じるときに描き直す（30秒ごとの描き直しを待たない）
    clearTimeout(idleTimer)
    const open = openOrder(state, at)
    if (open) idleTimer = setTimeout(render, Date.parse(open.lastAt) + ORDER_IDLE_MS - at.getTime() + 50)
  }

  // ---- 報告時刻 ----
  function followClock() {
    if (timeEdited) return
    timeInput.value = nearestHour(now())
  }
  timeInput.addEventListener('input', () => {
    timeEdited = true
    render()
  })
  nowButton.addEventListener('click', () => {
    timeEdited = false
    followClock()
    render()
  })

  // 開きっぱなしでも時刻と「前の営業日の数字」の判定が古くならないように。別のタブの変更も拾う
  const refresh = () => {
    followClock()
    render()
  }
  const stopFresh = keepFresh(store, {
    onTick: refresh,
    onReload: () => {
      // 別のタブで変わったら、戻す先が古くなるので知らせを消す
      notice.hide()
      refresh()
    },
  })

  refresh()

  return {
    store,
    unmount: () => {
      stopFresh()
      dockObserver?.disconnect()
      notice.hide()
      clearTimeout(idleTimer)
      clearTimeout(copyTimer)
    },
  }
}
