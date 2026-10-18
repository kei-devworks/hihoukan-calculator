// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { numberInput } from './number-input'

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('numberInput', () => {
  it('数字のキーボードを出す文字の欄（カーソルを動かせるように type="number" にしない）', () => {
    const input = numberInput({ id: 'n', class: 'wide' })
    expect(input.type).toBe('text')
    expect(input.inputMode).toBe('numeric')
    expect(input.className).toBe('num wide')
  })

  it('欄に入ると、押した位置にカーソルが置かれても、いちばん右に戻す', () => {
    vi.useFakeTimers()
    const input = numberInput()
    input.value = '120'
    document.body.append(input)
    input.focus()
    // ブラウザが、押した位置（数字の左）にカーソルを置く
    input.setSelectionRange(0, 0)
    vi.runAllTimers()
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 3])
  })

  it('文字を選んでいるとき（全部選んで打ち直すなど）は、選んだままにする', () => {
    vi.useFakeTimers()
    const input = numberInput()
    input.value = '120'
    document.body.append(input)
    input.focus()
    input.setSelectionRange(0, 3)
    input.click()
    vi.runAllTimers()
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
  })

  it('入るためのタップのあと（クリック）でも右に戻す。入ったあとにもう一度押した位置は動かさない', () => {
    vi.useFakeTimers()
    const input = numberInput()
    input.value = '120'
    document.body.append(input)
    input.focus()
    input.setSelectionRange(1, 1)
    input.click()
    vi.runAllTimers()
    expect(input.selectionStart).toBe(3)

    vi.advanceTimersByTime(2000)
    input.setSelectionRange(1, 1)
    input.click()
    vi.runAllTimers()
    expect(input.selectionStart).toBe(1)
  })
})
