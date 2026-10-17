// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openShareDialog } from './share-dialog'

const url = 'https://kei-devworks.github.io/hihoukan-calculator/'
const buttonNames = (dialog: HTMLElement) => [...dialog.querySelectorAll('button')].map((b) => b.textContent)

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('openShareDialog', () => {
  it('見出し・リンク・QR コードを出す', async () => {
    const dialog = openShareDialog({ title: 'このサイトを共有', url, qrLabel: 'このサイトの入口の QR コード' })
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('h2')?.textContent).toBe('このサイトを共有')
    expect(dialog.querySelector('.share-url')?.textContent).toBe(url)
    await vi.waitFor(() => expect(dialog.querySelector('svg[aria-label="このサイトの入口の QR コード"]')).not.toBeNull())
  })

  it('共有シートのない端末では、送るボタンを出さない', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    const dialog = openShareDialog({ title: '共有', url })
    expect(buttonNames(dialog)).toEqual(['リンクをコピー', '閉じる'])
  })

  it('共有シートのある端末では、送るボタンで title と url を渡す', () => {
    const share = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, share })
    const dialog = openShareDialog({ title: '共有', url })
    const send = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'AirDrop・LINE などで送る')
    send?.click()
    expect(share).toHaveBeenCalledWith({ title: '共有', url })
  })

  it('閉じるとページから取り除く', () => {
    const dialog = openShareDialog({ title: '共有', url })
    const close = [...dialog.querySelectorAll('button')].find((b) => b.textContent === '閉じる')
    close?.click()
    expect(document.querySelector('dialog')).toBeNull()
  })
})
