import { h } from './dom'

export type ViewTab = {
  /** 要素の id にも使う（英小文字・数字・-） */
  id: string
  label: string
  /** その画面の中身 */
  panel: HTMLElement
}

export type ViewTabs = {
  /** 切り替えのボタンの並び（tablist） */
  element: HTMLElement
  select: (id: string) => void
  readonly current: string
}

/**
 * ボタンで画面を切り替える（ページが縦に長くならないように）。選んでいない画面は hidden にする。
 * 左右の矢印キーで隣のボタンへ移れる
 */
export function viewTabs(tabs: ViewTab[], options: { label: string; onChange?: (id: string) => void }): ViewTabs {
  let current = tabs[0]?.id ?? ''
  const buttons = tabs.map((tab) =>
    h('button', {
      type: 'button',
      role: 'tab',
      id: `tab-${tab.id}`,
      'aria-controls': `panel-${tab.id}`,
      text: tab.label,
    }),
  )
  tabs.forEach((tab) => {
    tab.panel.id = `panel-${tab.id}`
    tab.panel.setAttribute('role', 'tabpanel')
    tab.panel.setAttribute('aria-labelledby', `tab-${tab.id}`)
  })
  const element = h('div', { class: 'view-tabs', role: 'tablist', 'aria-label': options.label }, buttons)

  const select = (id: string) => {
    if (!tabs.some((t) => t.id === id)) return
    const changed = id !== current
    current = id
    tabs.forEach((tab, i) => {
      const selected = tab.id === id
      buttons[i]!.setAttribute('aria-selected', String(selected))
      buttons[i]!.tabIndex = selected ? 0 : -1
      tab.panel.hidden = !selected
    })
    if (changed) options.onChange?.(id)
  }

  buttons.forEach((button, i) => {
    button.addEventListener('click', () => select(tabs[i]!.id))
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      select(tabs[next]!.id)
      buttons[next]!.focus()
    })
  })
  select(current)

  return {
    element,
    select,
    get current() {
      return current
    },
  }
}
