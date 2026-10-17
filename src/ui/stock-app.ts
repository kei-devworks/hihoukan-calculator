import './stock.css'
import { defaultPrice } from '../core/catalog'
import { formatNumber, formatYen } from '../core/format'
import type { SaveResult } from '../core/json-store'
import {
  carryRemainingToStart,
  entryOf,
  grandStockTotal,
  itemResult,
  resetStock,
  sectionResult,
  setField,
  stockCarriedOverSince,
  STOCK_FIELDS,
  type ItemResult,
  type StockConfig,
  type StockField,
  type StockState,
} from '../core/stock'
import { StockStore } from '../core/stock-store'
import { openLocalStorage, type KeyValueStorage } from '../core/storage'
import { formatMonthDayTime } from '../core/time'
import { confirmButton } from './confirm-button'
import { h } from './dom'
import { keepFresh, pageHeader, pageStatus } from './page-parts'

export type MountOptions = {
  /** 保存先。省略すると端末の localStorage（使えなければ保存しない） */
  storage?: KeyValueStorage | null
  /** いまの時刻。テストで差し替える */
  now?: () => Date
}

export type StockApp = {
  store: StockStore
  /** タイマーとイベントを外す（テスト用） */
  unmount: () => void
}

const FIELD_LABELS: Record<StockField, string> = {
  start: '開店時',
  added: '追加',
  remaining: '残数',
}

/** 読み上げ用の、欄の詳しい名前 */
const FIELD_DESCRIPTIONS: Record<StockField, string> = {
  start: '開店時の在庫',
  added: '途中で追加した数',
  remaining: '残数',
}

/** 入力欄の文字を数に読む。空なら null、0 以上の整数でなければ undefined（受け付けない） */
function readCount(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function describe(result: ItemResult): { text: string; tone: 'muted' | 'ok' | 'warn' } {
  switch (result.status) {
    case 'empty':
      return { text: '—', tone: 'muted' }
    case 'needStart':
      return { text: '開店時の在庫を入れてください', tone: 'warn' }
    case 'needRemaining':
      return { text: `在庫 ${formatNumber(result.stock)}個（残数を入れると計算します）`, tone: 'muted' }
    case 'tooMany':
      return { text: `残数が在庫（${formatNumber(result.stock)}個）より多くなっています`, tone: 'warn' }
    case 'ok':
      return { text: `売れた ${formatNumber(result.sold)}個 → ${formatYen(result.amount)}`, tone: 'ok' }
  }
}

/**
 * 「在庫の差」のページを root の中に組み立てる。
 * 開店時・追加・残数を数字で入れると、見出しごとに売上を出す（docs/architecture.md）
 */
export function mountStockApp(root: HTMLElement, config: StockConfig, options: MountOptions = {}): StockApp {
  const now = options.now ?? (() => new Date())
  const store = new StockStore(config, options.storage === undefined ? openLocalStorage() : options.storage)
  let lastSave: SaveResult | null = null

  const status = pageStatus({
    dayStartHour: config.dayStartHour,
    idleText: '入れた数はこの端末に自動で保存されます',
    carriedText: (since) =>
      `${formatMonthDayTime(since)} から入れた数字が残っています。今日を始めるときは、残数を開店時の在庫に移すか、全部消してください。`,
    carriedActions: [
      {
        label: '残数を今日の開店時の在庫にする',
        armedLabel: 'もう一度押すと移す',
        onConfirm: () => change(carryRemainingToStart(store.current, now())),
      },
      {
        label: '全部消して始める',
        armedLabel: 'もう一度押すと全部消す',
        onConfirm: () => change(resetStock(store.current)),
      },
    ],
  })

  // ---- 品目ごとの入力欄 ----
  const rows = config.sections.flatMap((section) =>
    section.items.map((item) => {
      const name = item.name ?? `${formatNumber(defaultPrice(config, item.priceId))}円`
      const inputs = Object.fromEntries(
        STOCK_FIELDS.map((field) => [
          field,
          h('input', {
            type: 'number',
            id: `${item.id}-${field}`,
            inputmode: 'numeric',
            pattern: '[0-9]*',
            min: 0,
            step: 1,
            enterkeyhint: 'done',
            'aria-label': `${section.title} ${name} ${FIELD_DESCRIPTIONS[field]}`,
          }),
        ]),
      ) as Record<StockField, HTMLInputElement>
      return { section, item, name, inputs, result: h('p', { class: 'stock-result' }) }
    }),
  )

  for (const row of rows) {
    for (const field of STOCK_FIELDS) {
      const input = row.inputs[field]
      input.addEventListener('input', () => {
        const value = readCount(input.value)
        // 0 以上の整数でない値（負の数・小数）は記録しない。欄から離れると記録どおりに戻る
        input.classList.toggle('invalid', value === undefined)
        if (value === undefined) return
        change(setField(store.current, row.item.id, field, value, now()))
      })
      input.addEventListener('blur', () => {
        input.classList.remove('invalid')
        input.value = valueText(entryOf(store.current, row.item.id)[field])
      })
    }
  }

  const sectionViews = config.sections.map((section) => ({
    section,
    subtotal: h('span'),
    note: h('p', { class: 'stock-note' }),
    summary: h('b'),
    breakdown: h('p', { class: 'stock-breakdown' }),
  }))

  const sectionCards = sectionViews.map((view, i) =>
    h('section', { class: i % 2 === 0 ? 'card' : 'card alt', 'data-section': view.section.id }, [
      h('h2', { text: view.section.title }),
      ...rows
        .filter((row) => row.section === view.section)
        .map((row) =>
          h('div', { class: 'stock-item', 'data-item': row.item.id }, [
            h('div', { class: 'stock-head' }, [
              h('span', { class: 'nm', text: row.name }),
              h('span', { class: 'pr', text: `¥${formatNumber(defaultPrice(config, row.item.priceId))}` }),
            ]),
            h(
              'div',
              { class: 'stock-fields' },
              STOCK_FIELDS.map((field) =>
                h('label', { class: 'stock-field', for: row.inputs[field].id }, [
                  h('span', { text: FIELD_LABELS[field] }),
                  row.inputs[field],
                ]),
              ),
            ),
            row.result,
          ]),
        ),
      h('div', { class: 'sub' }, [h('span', { text: `${view.section.title}の売上` }), view.subtotal]),
      view.note,
    ]),
  )

  // ---- 計算結果（見出しごとに分けて出す） ----
  const grand = h('span')
  const resultCard = h('section', { class: 'card stock-results', id: 'results' }, [
    h('h2', { text: '計算結果' }),
    ...sectionViews.map((view) =>
      h('div', { class: 'stock-summary', 'data-section': view.section.id }, [
        h('div', { class: 'stock-summary-line' }, [h('span', { text: view.section.title }), view.summary]),
        view.breakdown,
      ]),
    ),
    h('div', { class: 'stock-grand' }, [h('span', { text: `合計（${config.sections.map((s) => s.title).join('＋')}）` }), grand]),
  ])

  const resetButton = h('button', { type: 'button', class: 'ghost' })
  confirmButton(resetButton, {
    label: 'リセット',
    armedLabel: 'もう一度押すと全部消す',
    onConfirm: () => change(resetStock(store.current)),
  })

  root.replaceChildren(
    pageHeader(config.title, [
      h('p', {
        class: 'lead',
        text: '開店時に在庫を入れ、途中で足したら「追加」に合計を入れ、閉店時などに残数を入れると売上が出ます。',
      }),
      status.saveStatus,
    ]),
    status.storageWarning,
    status.carriedNotice,
    ...sectionCards,
    resultCard,
    h('div', { class: 'foot' }, [resetButton]),
  )

  // ---- 状態の変更と描画 ----
  function change(next: StockState) {
    lastSave = store.update(next)
    render()
  }

  function render() {
    const state = store.current
    const at = now()

    for (const row of rows) {
      const entry = entryOf(state, row.item.id)
      for (const field of STOCK_FIELDS) {
        const input = row.inputs[field]
        // 入力中の欄は書き換えない（打っている途中の値を消さないように）
        if (document.activeElement !== input) input.value = valueText(entry[field])
      }
      const r = itemResult(config, state, row.item)
      const { text, tone } = describe(r)
      row.result.textContent = text
      row.result.dataset.tone = tone
      // 直すべき欄を赤枠で示す
      row.inputs.start.classList.toggle('mismatch', r.status === 'needStart')
      row.inputs.remaining.classList.toggle('mismatch', r.status === 'tooMany')
    }

    for (const view of sectionViews) {
      const r = sectionResult(config, state, view.section)
      view.subtotal.textContent = formatYen(r.amount)
      view.summary.textContent = formatYen(r.amount)
      view.breakdown.textContent =
        r.sold.length > 0 ? r.sold.map((s) => `${s.item.name ?? ''} ${formatNumber(s.sold)}個`).join('・') : '—'
      const notes = [
        r.pending > 0 ? `入れかけ ${r.pending}品目（売上に入っていません）` : '',
        r.problems > 0 ? `要確認 ${r.problems}品目（残数が在庫より多い）` : '',
      ].filter(Boolean)
      view.note.textContent = notes.join('、')
      view.note.hidden = notes.length === 0
    }
    grand.textContent = formatYen(grandStockTotal(config, state))

    status.update({
      available: store.available,
      lastSave,
      updatedAt: state.updatedAt,
      carriedSince: stockCarriedOverSince(config, state, at),
      now: at,
    })
  }

  const stopFresh = keepFresh(store, { onTick: render, onReload: render })
  render()

  return { store, unmount: stopFresh }
}

function valueText(v: number | null): string {
  return v === null ? '' : String(v)
}
