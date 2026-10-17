// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noticeBar, type NoticeBar } from './notice-bar'

let bar: NoticeBar
const text = () => bar.element.querySelector('.notice-bar-text')?.textContent
const undoButton = () => bar.element.querySelector<HTMLButtonElement>('.notice-bar-undo')!

beforeEach(() => {
  vi.useFakeTimers()
  bar = noticeBar(180_000)
  document.body.replaceChildren(bar.element)
})

afterEach(() => vi.useRealTimers())

describe('noticeBar', () => {
  it('はじめは隠れていて、show で出す。undo がなければ［元に戻す］は出さない', () => {
    expect(bar.visible).toBe(false)
    bar.show('お知らせ')
    expect(bar.visible).toBe(true)
    expect(text()).toBe('お知らせ')
    expect(undoButton().hidden).toBe(true)
  })

  it('［元に戻す］で undo を呼び、「元に戻しました」を少し出して消える', () => {
    const undo = vi.fn()
    bar.show('全部 0 にしました', undo)
    undoButton().click()
    expect(undo).toHaveBeenCalledOnce()
    expect(text()).toBe('元に戻しました')
    expect(undoButton().hidden).toBe(true)
    vi.advanceTimersByTime(2500)
    expect(bar.visible).toBe(false)
  })

  it('3分たつか［×］で消える', () => {
    bar.show('お知らせ', () => {})
    vi.advanceTimersByTime(179_999)
    expect(bar.visible).toBe(true)
    vi.advanceTimersByTime(1)
    expect(bar.visible).toBe(false)

    bar.show('お知らせ')
    bar.element.querySelector<HTMLButtonElement>('.notice-bar-close')!.click()
    expect(bar.visible).toBe(false)
  })
})
