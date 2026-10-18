import { formatNumber } from '../core/format'
import { priceOf, type CustomItem, type TallyConfig, type TallyState } from '../core/tally'
import { h } from './dom'
import { holdButton } from './hold-button'
import { numberInput } from './number-input'

export type TallyItemsActions = {
  setPrice: (priceId: string, value: number) => void
  resetPrices: () => void
  addItem: (sectionId: string, name: string, price: number) => void
  updateItem: (id: string, change: { name?: string; price?: number }) => void
  removeItem: (id: string) => void
}

export type TallyItems = {
  element: HTMLElement
  render: (state: TallyState) => void
}

/** 欄の文字を 1 以上の整数に読む。読めなければ null */
function readPrice(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(n) && n > 0 ? n : null
}

/**
 * 「品目」の画面: 見出しごとに、設定の品目の単価と、画面から足した品目（名前・単価・消す）と、［＋ 品目を足す］。
 * 足した品目はその端末だけに出る（docs/usage.md）
 */
export function tallyItems(config: TallyConfig, actions: TallyItemsActions): TallyItems {
  const title = h('h2', { id: 'prices-title' })
  const resetPricesButton = h('button', { type: 'button', class: 'ghost', text: '単価をすべて既定に戻す' })
  resetPricesButton.addEventListener('click', actions.resetPrices)

  // ---- 設定の品目の単価（見出しごとに、その見出しの品目が使う単価を並べる） ----
  const priceFields = config.prices.map((def) => {
    const input = numberInput({ id: `price-${def.id}`, enterkeyhint: 'done' })
    input.addEventListener('input', () => {
      // 打ち直しの途中で空になっても 0 円にはしない。数でない文字も受け付けない（欄から離れると今の単価に戻る）
      const value = Number(input.value.trim())
      if (input.value.trim() === '' || !Number.isFinite(value)) return
      actions.setPrice(def.id, value)
    })
    const sectionId = config.sections.find((s) => s.items.some((i) => i.priceId === def.id))?.id
    return { def, input, hint: h('span', { class: 'default-hint' }), sectionId }
  })
  let current: TallyState | null = null
  for (const { def, input } of priceFields) {
    input.addEventListener('blur', () => current && (input.value = String(priceOf(config, current, def.id))))
  }

  // ---- 見出しごと ----
  const sections = config.sections.map((section) => {
    const customList = h('div', { class: 'custom-list' })
    const toggle = h('button', { type: 'button', class: 'ghost add-item-toggle', text: `＋ ${section.title}に品目を足す` })
    const nameInput = h('input', {
      type: 'text',
      id: `new-name-${section.id}`,
      maxlength: 20,
      placeholder: '名前（空なら値段で呼ぶ）',
      'aria-label': `${section.title}に足す品目の名前`,
      enterkeyhint: 'next',
    })
    const priceInput = numberInput({
      id: `new-price-${section.id}`,
      placeholder: '円',
      'aria-label': `${section.title}に足す品目の単価`,
      enterkeyhint: 'done',
    })
    const error = h('p', { class: 'add-item-error', hidden: true, text: '単価を 1 円以上の整数で入れてください' })
    const addButton = h('button', { type: 'button', class: 'solid', text: '足す' })
    const cancelButton = h('button', { type: 'button', class: 'ghost', text: 'やめる' })
    const form = h('div', { class: 'add-item-form', hidden: true }, [
      h('label', { for: nameInput.id, text: '名前' }),
      nameInput,
      h('label', { for: priceInput.id, text: '単価' }),
      priceInput,
      error,
      h('div', { class: 'add-item-actions' }, [cancelButton, addButton]),
    ])
    const closeForm = () => {
      form.hidden = true
      toggle.hidden = false
      nameInput.value = ''
      priceInput.value = ''
      error.hidden = true
    }
    toggle.addEventListener('click', () => {
      form.hidden = false
      toggle.hidden = true
      nameInput.focus()
    })
    cancelButton.addEventListener('click', closeForm)
    addButton.addEventListener('click', () => {
      const price = readPrice(priceInput.value)
      if (price === null) {
        error.hidden = false
        return
      }
      actions.addItem(section.id, nameInput.value, price)
      closeForm()
    })
    const block = h('div', { class: 'items-section', 'data-section': section.id }, [
      h('h3', { text: section.title }),
      h(
        'div',
        { class: 'pgrid' },
        priceFields
          .filter((f) => f.sectionId === section.id)
          .flatMap(({ input, def, hint }) => [h('label', { for: input.id }, [def.label, hint]), input]),
      ),
      customList,
      toggle,
      form,
    ])
    return { section, block, customList, key: '' }
  })

  /** 足した品目の行。名前と単価はその場で直せる。消すのは長押し */
  const customRow = (item: CustomItem) => {
    const nameInput = h('input', {
      type: 'text',
      id: `custom-name-${item.id}`,
      maxlength: 20,
      placeholder: '名前（空なら値段で呼ぶ）',
      'aria-label': '足した品目の名前',
    })
    const priceInput = numberInput({ id: `custom-price-${item.id}`, 'aria-label': '足した品目の単価' })
    nameInput.addEventListener('input', () => actions.updateItem(item.id, { name: nameInput.value }))
    priceInput.addEventListener('input', () => {
      const price = readPrice(priceInput.value)
      if (price !== null) actions.updateItem(item.id, { price })
    })
    priceInput.addEventListener('blur', () => {
      const saved = current?.customItems.find((c) => c.id === item.id)
      if (saved) priceInput.value = String(saved.price)
    })
    const remove = holdButton({ label: '消す', armedLabel: '長押しで消す', onConfirm: () => actions.removeItem(item.id) })
    // 名前は1行に広く、その下に単価と［消す］（名前が欄からはみ出さないように）
    return h('div', { class: 'custom-row', 'data-item': item.id }, [nameInput, h('div', { class: 'custom-row-line' }, [priceInput, h('span', { class: 'cash-unit', text: '円' }), remove])])
  }

  const element = h('section', { class: 'card prices', 'aria-labelledby': 'prices-title' }, [
    title,
    ...sections.map((s) => s.block),
    h('p', {
      class: 'items-note',
      text: '足した品目は、この端末だけに出ます。ほかの端末でも同じ名前で足してください。ずっと売る品目は、ページの設定に書いてもらうと全部の端末に出ます。',
    }),
    h('div', { class: 'foot' }, [resetPricesButton]),
  ])

  function render(state: TallyState) {
    current = state
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
    resetPricesButton.disabled = changedPrices === 0

    for (const s of sections) {
      const mine = state.customItems.filter((c) => c.sectionId === s.section.id)
      const key = mine.map((c) => c.id).join(',')
      if (key !== s.key) {
        s.key = key
        s.customList.replaceChildren(...mine.map(customRow))
      }
      for (const c of mine) {
        const row = s.customList.querySelector<HTMLElement>(`[data-item="${c.id}"]`)
        const name = row?.querySelector<HTMLInputElement>(`#custom-name-${c.id}`)
        const price = row?.querySelector<HTMLInputElement>(`#custom-price-${c.id}`)
        if (name && document.activeElement !== name) name.value = c.name ?? ''
        if (price && document.activeElement !== price) price.value = String(c.price)
        price?.setAttribute('aria-label', `${c.name ?? '足した品目'}の単価`)
      }
    }

    const parts = [
      changedPrices > 0 ? `単価 ${changedPrices}件 変更あり` : '',
      state.customItems.length > 0 ? `${state.customItems.length}品目 追加` : '',
    ].filter(Boolean)
    title.textContent = parts.length > 0 ? `品目と単価（${parts.join('・')}）` : '品目と単価'
  }

  return { element, render }
}
