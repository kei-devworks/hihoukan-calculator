import './tally.css'
import { formatNumber, formatYen } from '../core/format'
import { buildSalesReport } from '../core/report'
import { openLocalStorage, type KeyValueStorage } from '../core/storage'
import {
  bump,
  carriedOverSince,
  countOf,
  displayName,
  grandTotal,
  priceOf,
  resetCounts,
  resetPrices,
  sectionTotal,
  setPrice,
  type TallyConfig,
  type TallyState,
} from '../core/tally'
import { TallyStore, type SaveResult } from '../core/tally-store'
import { businessDate, formatMonthDayTime, formatTime, nearestHour } from '../core/time'
import { copyText, selectContents } from './clipboard'
import { confirmButton } from './confirm-button'
import { h } from './dom'

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

  // ---- 見出し・報告時刻・保存の状態 ----
  const timeInput = h('input', { type: 'time', id: 'report-time' })
  const nowButton = h('button', { type: 'button', class: 'ghost', text: '今' })
  const saveStatus = h('p', { class: 'save-status', role: 'status' })
  const storageWarning = h('p', { class: 'notice warn', role: 'alert', hidden: true })

  const carriedText = h('p')
  const carriedReset = h('button', { type: 'button', class: 'ghost' })
  const carriedNotice = h('div', { class: 'notice', role: 'alert', hidden: true }, [carriedText, carriedReset])
  confirmButton(carriedReset, {
    label: '0 に戻して今日を始める',
    armedLabel: 'もう一度押すと全部 0',
    onConfirm: () => change(resetCounts(store.current)),
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
  for (const row of rows) {
    row.minus.addEventListener('click', () => change(bump(store.current, row.item.id, -1, now())))
    row.plus.addEventListener('click', () => change(bump(store.current, row.item.id, 1, now())))
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
  const pricesSummary = h('summary')
  const resetPricesButton = h('button', { type: 'button', class: 'ghost', text: 'すべて既定に戻す' })
  resetPricesButton.addEventListener('click', () => change(resetPrices(store.current)))

  // ---- 報告文 ----
  const report = h('pre', { class: 'report', id: 'report' })
  const copyButton = h('button', { type: 'button', class: 'solid', text: 'コピー' })
  const resetButton = h('button', { type: 'button', class: 'ghost' })
  confirmButton(resetButton, {
    label: 'リセット',
    armedLabel: 'もう一度押すと全部 0',
    onConfirm: () => change(resetCounts(store.current)),
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

  root.replaceChildren(
    h('header', { class: 'app-head' }, [
      h('a', { class: 'back', href: '../', text: '‹ 一覧' }),
      h('h1', { text: config.title }),
      h('div', { class: 'timebar' }, [h('label', { for: timeInput.id, text: '報告時刻' }), timeInput, nowButton]),
      saveStatus,
    ]),
    storageWarning,
    carriedNotice,
    ...sectionCards,
    h('div', { class: 'total' }, [h('span', { text: '合計' }), total]),
    h('details', { class: 'prices' }, [
      pricesSummary,
      h(
        'div',
        { class: 'pgrid' },
        priceFields.flatMap(({ input, def, hint }) => [h('label', { for: input.id }, [def.label, hint]), input]),
      ),
      h('div', { class: 'foot' }, [resetPricesButton]),
    ]),
    h('section', { class: 'card' }, [
      h('div', { class: 'rhead' }, [h('h2', { text: '報告文' }), copyButton]),
      report,
      h('div', { class: 'foot' }, [resetButton]),
    ]),
  )

  // ---- 状態の変更と描画 ----
  function change(next: TallyState) {
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
    pricesSummary.textContent = changedPrices > 0 ? `単価設定（${changedPrices}件 変更あり）` : '単価設定'
    resetPricesButton.disabled = changedPrices === 0

    renderStatus(state, at)
  }

  function renderStatus(state: TallyState, at: Date) {
    if (!store.available || lastSave === 'failed') {
      storageWarning.hidden = false
      storageWarning.textContent = store.available
        ? '保存に失敗しました。端末の空き容量を確かめてください。このままページを閉じると数字が消えます。'
        : 'この端末では数字を保存できません。再読み込みやページを閉じると消えます。プライベートブラウズになっていないか確かめてください。'
      saveStatus.hidden = true
    } else {
      storageWarning.hidden = true
      saveStatus.hidden = false
      if (state.updatedAt) {
        const updated = new Date(state.updatedAt)
        const sameDay = businessDate(updated, config.dayStartHour) === businessDate(at, config.dayStartHour)
        saveStatus.textContent = `この端末に保存済み（最終更新 ${sameDay ? formatTime(updated) : formatMonthDayTime(updated)}）`
      } else {
        saveStatus.textContent = '数えた数はこの端末に自動で保存されます'
      }
    }

    const since = carriedOverSince(config, state, at)
    carriedNotice.hidden = since === null
    if (since) {
      carriedText.textContent = `${formatMonthDayTime(since)} から数えた数字が残っています。今日の集計を始めるときは 0 に戻してください。`
    }
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

  // ---- 外からの変化 ----
  // 開きっぱなしの端末でも、時刻と「前の営業日の数字」の判定が古くならないように
  const tick = setInterval(() => {
    followClock()
    render()
  }, 30_000)
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    followClock()
    render()
  }
  // 同じ端末の別のタブで数字が変わったとき
  const onStorage = (e: StorageEvent) => {
    if (e.key !== store.key && e.key !== null) return
    store.reload()
    render()
  }
  // 戻るボタンでキャッシュから表示されたとき（その間に別のタブで変わっているかもしれない）
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return
    store.reload()
    followClock()
    render()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
  window.addEventListener('pageshow', onPageShow)

  followClock()
  render()

  return {
    store,
    unmount: () => {
      clearInterval(tick)
      clearTimeout(copyTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
    },
  }
}
