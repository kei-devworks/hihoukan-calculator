import './stock.css'
import { clearCashCount, floatUnused } from '../core/cash'
import { defaultPrice } from '../core/catalog'
import { formatNumber, formatPrice, formatYen } from '../core/format'
import type { SaveResult } from '../core/json-store'
import {
  carryRemainingToStart,
  entryOf,
  grandStockTotal,
  itemResult,
  resetStock,
  sectionCashOf,
  sectionResult,
  setField,
  setSectionCash,
  settleSection,
  settlementOf,
  stockCarriedOverSince,
  STOCK_FIELDS,
  type ItemResult,
  type StockConfig,
  type StockField,
  type StockState,
} from '../core/stock'
import { StockStore } from '../core/stock-store'
import { openLocalStorage, type KeyValueStorage } from '../core/storage'
import { formatMonthDayTime, formatTime } from '../core/time'
import { cashPanel, type CashPanel } from './cash-panel'
import { h } from './dom'
import { holdButton } from './hold-button'
import { numberInput } from './number-input'
import { keepFresh, pageHeader, pageStatus } from './page-parts'
import { viewTabs } from './view-tabs'

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
      // 欄の「開店時 ＋ 追加 − 残数」の続き
      return { text: `＝ 売れた ${formatNumber(result.sold)}個 → ${formatYen(result.amount)}`, tone: 'ok' }
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
        armedLabel: '長押しで残数を開店時に移す',
        hold: true,
        onConfirm: () => change(carryRemainingToStart(store.current, now())),
      },
      {
        label: '全部消して始める',
        armedLabel: '長押しで全部消す',
        hold: true,
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
          numberInput({
            id: `${item.id}-${field}`,
            enterkeyhint: 'next',
            'aria-label': `${section.title} ${name} ${FIELD_DESCRIPTIONS[field]}`,
          }),
        ]),
      ) as Record<StockField, HTMLInputElement>
      return { section, item, name, inputs, result: h('p', { class: 'stock-result', 'data-item': item.id }) }
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
      // キーボードの「次へ」（Enter）は、下の品目の同じ欄へ。いちばん下ならキーボードを閉じる
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const same = rows.filter((r) => r.section === row.section)
        const next = same[same.indexOf(row) + 1]
        if (next) next.inputs[field].focus()
        else input.blur()
      })
    }
  }
  for (const section of config.sections) {
    const same = rows.filter((r) => r.section === section)
    for (const field of STOCK_FIELDS) same.at(-1)?.inputs[field].setAttribute('enterkeyhint', 'done')
  }

  /**
   * 見出しの品目の欄。見た目は品目ごとに「開店時 ＋ 追加 − 残数」を横に並べるが、欄の HTML の順は列ごとにする。
   * キーボードの「↓」や Tab は HTML の順に進むので、残数の次は下の品目の残数になる（閉店時に残数だけ続けて入れられる）。
   * 置き場所は grid の行・列で決める（品目ごとに3行: 名前・欄・売れた数）
   */
  function stockGrid(sectionRows: typeof rows): HTMLElement {
    const place = <T extends HTMLElement>(el: T, row: number, column: string): T => {
      el.style.gridRow = String(row)
      el.style.gridColumn = column
      return el
    }
    const top = (k: number) => k * 3 + 1
    const fixed = sectionRows.flatMap((row, k) => [
      place(
        h('div', { class: k === 0 ? 'stock-head' : 'stock-head sep', 'data-item': row.item.id }, [
          h('span', { class: 'nm', text: row.name }),
          h('span', { class: 'pr', text: `¥${formatNumber(defaultPrice(config, row.item.priceId))}` }),
        ]),
        top(k),
        '1 / -1',
      ),
      place(h('span', { class: 'stock-op', 'aria-hidden': 'true', text: '＋' }), top(k) + 1, '2'),
      place(h('span', { class: 'stock-op', 'aria-hidden': 'true', text: '−' }), top(k) + 1, '4'),
      place(row.result, top(k) + 2, '1 / -1'),
    ])
    const fields = STOCK_FIELDS.flatMap((field, f) =>
      sectionRows.map((row, k) =>
        place(
          h('label', { class: 'stock-field', for: row.inputs[field].id }, [h('span', { text: FIELD_LABELS[field] }), row.inputs[field]]),
          top(k) + 1,
          String(1 + f * 2),
        ),
      ),
    )
    return h('div', { class: 'stock-grid' }, [...fixed, ...fields])
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
      stockGrid(rows.filter((row) => row.section === view.section)),
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

  const resetButton = holdButton({
    label: 'リセット',
    armedLabel: '長押しで全部消す',
    onConfirm: () => change(resetStock(store.current)),
  })

  // ---- 見出しごとのレジ精算と、精算を終える ----
  const cashConfig = config.cash
  const sectionTools = config.sections.map((section) => {
    const cash: CashPanel | null = cashConfig
      ? cashPanel({
          cash: cashConfig,
          idPrefix: `cash-${section.id}`,
          title: `${section.title}のレジ精算`,
          labelPrefix: `${section.title} `,
          expectedLabel: '在庫から出した売上',
          hints: {
            over: '残数や追加の入れまちがいがないか確かめてください',
            under: '残数の数えまちがいや、お釣りのまちがいがないか確かめてください',
          },
          onChange: (next) => change(setSectionCash(store.current, section.id, next, now())),
          onFloatUnused: () => change(setSectionCash(store.current, section.id, floatUnused(sectionCashOf(store.current, section.id)), now())),
          onClear: () => change(setSectionCash(store.current, section.id, clearCashCount(sectionCashOf(store.current, section.id)), now())),
        })
      : null
    const settleStatus = h('p', { class: 'settle-status' })
    const settleButton = h('button', { type: 'button', class: 'solid' })
    settleButton.addEventListener('click', () => change(settleSection(store.current, section, now())))
    const settleCard = h('section', { class: 'card settle', 'aria-label': `${section.title}の精算` }, [settleStatus, h('div', { class: 'foot' }, [settleButton])])
    return { section, cash, settleStatus, settleButton, settleCard }
  })

  // ---- 見出し（弓道・手裏剣）を切り替える。1つの見出しの中で、在庫 → 売上 → レジ精算 → 精算を終える、が終わる ----
  const panels = config.sections.map((section, i) =>
    h('div', { class: 'view-panel' }, [
      sectionCards[i]!,
      ...(sectionTools[i]!.cash ? [sectionTools[i]!.cash!.element] : []),
      sectionTools[i]!.settleCard,
    ]),
  )
  const tabs = viewTabs(
    config.sections.map((section, i) => ({ id: section.id, label: section.title, panel: panels[i]! })),
    {
      label: '見出しの切り替え',
      onChange: () => {
        window.scrollTo({ top: 0 })
        render()
      },
    },
  )

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
    tabs.element,
    ...panels,
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

    for (const tool of sectionTools) {
      const r = sectionResult(config, state, tool.section)
      const settled = settlementOf(state, tool.section)
      // タブに売上と精算の印を出す（✓ 精算済み、！ 精算のあとに数が変わった）
      tabs.setLabel(tool.section.id, `${tool.section.title} ${formatPrice(r.amount)}${settled ? (settled.changed ? ' ！' : ' ✓') : ''}`)
      tool.cash?.render(
        sectionCashOf(state, tool.section.id),
        r.amount,
        tool.section.items.map((item) => ({ name: item.name ?? '', price: defaultPrice(config, item.priceId) })),
      )
      const name = tool.section.title
      tool.settleButton.textContent = settled ? `${name}の精算をやり直す` : `${name}の精算を終える`
      tool.settleStatus.dataset.tone = settled?.changed ? 'warn' : settled ? 'ok' : 'muted'
      tool.settleStatus.textContent = !settled
        ? `在庫とお金を数え終えたら押してください。タブに ✓ が付きます。`
        : settled.changed
          ? `${formatTime(new Date(settled.at))} に精算したあとで数が変わりました。数え直したら、もう一度押してください。`
          : `✓ ${formatTime(new Date(settled.at))} に精算を終えました。`
    }

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
