import { formatPrice } from '../core/format'
import { cleanLines, editSteps, findOrder, lineChanges, type OrderLines } from '../core/orders'
import { displayName, itemsOf, linesTotal, type TallyConfig, type TallyState } from '../core/tally'
import { formatTime } from '../core/time'
import { h } from './dom'
import { holdButton } from './hold-button'

export type OrderEditorActions = {
  save: (orderId: number, lines: OrderLines) => void
  cancel: (orderId: number) => void
  /** 直した記録 index の、直す前に戻す */
  revert: (orderId: number, index: number) => void
}

/** 「1,000円 2→1・ホタテ 0→1」（知らせと変更の記録に使う） */
export function describeChanges(config: TallyConfig, state: TallyState, before: OrderLines, after: OrderLines): string {
  const items = itemsOf(config, state)
  return lineChanges(
    before,
    after,
    items.map((i) => i.id),
  )
    .map((c) => `${displayName(config, state, items.find((i) => i.id === c.itemId)!)} ${c.from}→${c.to}`)
    .join('・')
}

/**
 * オーダーを直す画面（下から開くダイアログ）。オーダーの確認画面と同じ形で、品目ごとに −/＋ で数を変え、
 * ［＋ 品目を足す］でほかの品目も足せる。変更は下書きで、［変更を保存］を押すまで反映しない。
 * 直した記録には［この変更の前に戻す］、取り消しは長押しのボタン。閉じると取り除く
 */
export function openOrderEditor(
  config: TallyConfig,
  state: TallyState,
  orderId: number,
  actions: OrderEditorActions,
): HTMLDialogElement | null {
  const order = findOrder(state, orderId)
  if (!order) return null
  const items = itemsOf(config, state)
  const draft: OrderLines = { ...order.lines }
  /** ［＋ 品目を足す］で足した品目（0 に戻しても行を残す） */
  const added: string[] = []
  let showAdd = false

  const title = `${formatTime(new Date(order.openedAt))} のオーダーを編集`
  const summary = h('p', { class: 'editor-summary' })
  const rows = h('div', { class: 'editor-rows' })
  const addToggle = h('button', { type: 'button', class: 'ghost editor-add-toggle' })
  const addList = h('div', { class: 'editor-add-list' })
  const warning = h('p', { class: 'notice editor-warning', text: '報告文を送ったあとの変更は、次の報告で直った数が出ます。' })
  const history = h('div', { class: 'editor-history' })
  const saveButton = h('button', { type: 'button', class: 'solid', text: '変更を保存' })
  const closeButton = h('button', { type: 'button', class: 'ghost', text: 'やめる' })
  const cancelButton = holdButton({
    label: 'このオーダーを取り消す',
    armedLabel: '長押しでオーダーを取り消す',
    onConfirm: () => {
      close()
      actions.cancel(orderId)
    },
  })

  const dialog = h('dialog', { class: 'order-editor', 'aria-labelledby': 'order-editor-title' }, [
    h('div', { class: 'editor-head' }, [
      h('h2', { id: 'order-editor-title', text: title }),
      h('button', { type: 'button', class: 'ghost editor-x', 'aria-label': '編集をやめる', text: '×' }),
    ]),
    summary,
    rows,
    addToggle,
    addList,
    warning,
    history,
    h('div', { class: 'editor-danger' }, [cancelButton]),
    h('div', { class: 'editor-foot' }, [closeButton, saveButton]),
  ])

  const close = () => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close()
    dialog.remove()
  }
  closeButton.addEventListener('click', close)
  dialog.querySelector('.editor-x')!.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())
  saveButton.addEventListener('click', () => {
    close()
    actions.save(orderId, cleanLines(draft))
  })
  addToggle.addEventListener('click', () => {
    showAdd = !showAdd
    render()
  })

  const step = (itemId: string, delta: number) => {
    draft[itemId] = Math.max(0, (draft[itemId] ?? 0) + delta)
    render()
  }

  function render() {
    const next = cleanLines(draft)
    const changed = lineChanges(order!.lines, next, items.map((i) => i.id)).length > 0
    const before = linesTotal(config, state, order!.lines)
    const after = linesTotal(config, state, next)
    const diff = after - before
    summary.replaceChildren(
      `変更前 ${formatPrice(before)} → 変更後 `,
      h('b', { text: formatPrice(after) }),
      diff === 0 ? '' : `（${diff > 0 ? '＋' : '−'}${formatPrice(Math.abs(diff))}）`,
    )

    const shown = items.filter((i) => (order!.lines[i.id] ?? 0) > 0 || added.includes(i.id))
    rows.replaceChildren(
      ...shown.map((item) => {
        const name = displayName(config, state, item)
        const from = order!.lines[item.id] ?? 0
        const to = draft[item.id] ?? 0
        const minus = h('button', { type: 'button', class: 'mini-step', 'aria-label': `${name}を1つ減らす`, text: '−' })
        const plus = h('button', { type: 'button', class: 'mini-step', 'aria-label': `${name}を1つ増やす`, text: '＋' })
        minus.addEventListener('click', () => step(item.id, -1))
        plus.addEventListener('click', () => step(item.id, 1))
        return h('div', { class: from === to ? 'editor-row' : 'editor-row changed', 'data-item': item.id }, [
          h('span', { class: 'order-name', text: name }),
          h('span', { class: 'editor-from', text: from === to ? '' : `${from} →` }),
          h('span', { class: 'editor-ctrl' }, [minus, h('b', { class: 'editor-n', text: String(to) }), plus]),
        ])
      }),
    )

    const others = items.filter((i) => !shown.includes(i))
    addToggle.hidden = others.length === 0
    addToggle.textContent = showAdd ? '− 品目を足すのをやめる' : '＋ 品目を足す'
    addList.hidden = !showAdd || others.length === 0
    addList.replaceChildren(
      ...others.map((item) => {
        const button = h('button', { type: 'button', class: 'ghost', text: `＋ ${displayName(config, state, item)}` })
        button.addEventListener('click', () => {
          added.push(item.id)
          draft[item.id] = 1
          showAdd = false
          render()
        })
        return button
      }),
    )

    warning.hidden = !changed
    saveButton.disabled = !changed

    const steps = editSteps(order!)
    history.hidden = steps.length === 0
    history.replaceChildren(
      h('h3', { text: `変更の記録（${steps.length}回）` }),
      ...steps.map((s, index) => {
        const revert = h('button', { type: 'button', class: 'ghost', text: 'この変更の前に戻す' })
        revert.addEventListener('click', () => {
          close()
          actions.revert(orderId, index)
        })
        return h('div', { class: 'editor-history-row' }, [
          h('span', { text: `${formatTime(new Date(s.at))} ${describeChanges(config, state, s.before, s.after)}` }),
          revert,
        ])
      }),
    )
  }

  render()
  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  return dialog
}
