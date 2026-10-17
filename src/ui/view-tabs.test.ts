// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { h } from './dom'
import { viewTabs } from './view-tabs'

function setup() {
  const panels = { count: h('div', { text: '注文' }), log: h('div', { text: '記録' }), items: h('div', { text: '品目' }) }
  const onChange = vi.fn()
  const tabs = viewTabs(
    [
      { id: 'count', label: '注文', panel: panels.count },
      { id: 'log', label: '記録', panel: panels.log },
      { id: 'items', label: '品目', panel: panels.items },
    ],
    { label: '画面の切り替え', onChange },
  )
  document.body.replaceChildren(tabs.element, ...Object.values(panels))
  const buttons = [...tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  return { tabs, panels, buttons, onChange }
}

describe('viewTabs', () => {
  it('はじめは最初の画面だけを出し、ボタンと画面をつなぐ', () => {
    const { tabs, panels, buttons } = setup()
    expect(tabs.current).toBe('count')
    expect(buttons.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect([panels.count.hidden, panels.log.hidden, panels.items.hidden]).toEqual([false, true, true])
    expect(panels.log.getAttribute('aria-labelledby')).toBe(buttons[1]!.id)
    expect(buttons[1]!.getAttribute('aria-controls')).toBe(panels.log.id)
  })

  it('押した画面に切り替え、変わったときだけ onChange を呼ぶ', () => {
    const { tabs, panels, buttons, onChange } = setup()
    buttons[2]!.click()
    expect(tabs.current).toBe('items')
    expect([panels.count.hidden, panels.items.hidden]).toEqual([true, false])
    buttons[2]!.click()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('items')
  })

  it('左右の矢印キーで隣の画面へ移る（端からは反対の端へ）', () => {
    const { tabs, buttons } = setup()
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(tabs.current).toBe('items')
    buttons[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(tabs.current).toBe('count')
  })
})
