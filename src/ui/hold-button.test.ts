// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holdButton } from './hold-button'

let confirmed = 0
let button: HTMLButtonElement

const fire = (type: string) => button.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
const key = (type: 'keydown' | 'keyup', k: string) =>
  button.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }))
const state = () => [...button.classList].filter((c) => c === 'armed' || c === 'holding')

beforeEach(() => {
  vi.useFakeTimers()
  confirmed = 0
  button = holdButton({ label: 'リセット', armedLabel: '長押しで全部 0 にする', onConfirm: () => confirmed++ })
  document.body.replaceChildren(button)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('holdButton', () => {
  it('2つの文言を重ねて持ち、ふだんは構えていない', () => {
    expect(button.querySelector('.hold-idle')?.textContent).toBe('リセット')
    expect(button.querySelector('.hold-armed')?.textContent).toBe('長押しで全部 0 にする')
    expect(state()).toEqual([])
  })

  it('タップしただけでは実行せず、構えるだけ', () => {
    button.click()
    expect(state()).toEqual(['armed'])
    vi.advanceTimersByTime(10_000)
    expect(confirmed).toBe(0)
  })

  it('構えてから1秒押し続けると実行し、指を離したときのクリックでまた構えない', () => {
    button.click()
    fire('pointerdown')
    expect(state()).toEqual(['armed', 'holding'])
    vi.advanceTimersByTime(999)
    expect(confirmed).toBe(0)
    vi.advanceTimersByTime(1)
    expect(confirmed).toBe(1)
    expect(state()).toEqual([])
    fire('pointerup')
    button.click()
    expect(state()).toEqual([])
  })

  it('途中で離すとやめ、構えたまま。もう一度長押しすれば実行する', () => {
    button.click()
    fire('pointerdown')
    vi.advanceTimersByTime(500)
    fire('pointerup')
    button.click()
    vi.advanceTimersByTime(1000)
    expect(confirmed).toBe(0)
    expect(state()).toEqual(['armed'])
    fire('pointerdown')
    vi.advanceTimersByTime(1000)
    expect(confirmed).toBe(1)
  })

  it('構えてから4秒たつと元に戻り、長押ししても実行しない', () => {
    button.click()
    vi.advanceTimersByTime(4000)
    expect(state()).toEqual([])
    fire('pointerdown')
    vi.advanceTimersByTime(2000)
    expect(confirmed).toBe(0)
  })

  it('キーボードでは、構えてから Enter を押し続けると実行する', () => {
    button.click()
    key('keydown', 'Enter')
    vi.advanceTimersByTime(1000)
    expect(confirmed).toBe(1)
    key('keyup', 'Enter')
    expect(state()).toEqual([])
  })

  it('長押しのメニューを出さない', () => {
    const event = new Event('contextmenu', { cancelable: true })
    button.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
