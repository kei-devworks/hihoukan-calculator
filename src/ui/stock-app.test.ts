// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleStockConfig as config } from '../core/fixtures'
import { initialStockState, setField } from '../core/stock'
import { memoryStorage, type KeyValueStorage } from '../core/storage'
import { mountStockApp, type StockApp } from './stock-app'

let app: StockApp | undefined
let clock: Date

function mount(storage: KeyValueStorage | null = memoryStorage()) {
  app?.unmount()
  const root = document.createElement('main')
  document.body.replaceChildren(root)
  app = mountStockApp(root, config, { storage, now: () => clock })
  return { storage }
}

/** 欄に数字を打つ（label は「A ステッカー 開店時の在庫」の形） */
function type(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!input) throw new Error(`欄「${label}」がありません`)
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input'))
  input.blur()
  input.dispatchEvent(new Event('blur'))
  return input
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''
const result = (itemId: string) => text(`[data-item="${itemId}"] .stock-result`)
const summary = (sectionId: string) => text(`#results [data-section="${sectionId}"] .stock-summary-line b`)
const visibleAlerts = () =>
  [...document.querySelectorAll<HTMLElement>('[role="alert"]')].filter((el) => !el.hidden).map((el) => el.textContent)
const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name)
  if (!found) throw new Error(`ボタン「${name}」がありません`)
  return found
}

/** 長押しのボタン（ui/hold-button.ts）を、タップで構えてから1秒押し続ける */
const holdPress = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button.hold-button')].find(
    (b) => b.querySelector('.hold-idle')?.textContent === label,
  )
  if (!found) throw new Error(`長押しのボタン「${label}」がありません`)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    found.click()
    found.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    vi.advanceTimersByTime(1000)
  } finally {
    vi.useRealTimers()
  }
}

beforeEach(() => {
  clock = new Date('2026-10-15T10:00:00+09:00')
})

afterEach(() => {
  app?.unmount()
  app = undefined
})

describe('mountStockApp', () => {
  it('見出しごとに、品目と 開店時・追加・残数 の欄を並べる', () => {
    mount()
    expect([...document.querySelectorAll('[data-section] h2')].map((el) => el.textContent)).toEqual(['A', 'B'])
    expect(document.querySelectorAll('.stock-item input')).toHaveLength(4 * 3)
    expect(document.querySelector('input[aria-label="B 絵馬 途中で追加した数"]')).not.toBeNull()
  })

  it('開店時・追加・残数から、売れた数と売上を出す', () => {
    mount()
    type('A ステッカー 開店時の在庫', '20')
    expect(result('a-sticker')).toBe('在庫 20個（残数を入れると計算します）')
    type('A ステッカー 途中で追加した数', '10')
    type('A ステッカー 残数', '12')
    expect(result('a-sticker')).toBe('売れた 18個 → ￥18,000-')
  })

  it('見出しごとに売上を分けて出し、合計も添える', () => {
    mount()
    type('A ステッカー 開店時の在庫', '5')
    type('A ステッカー 残数', '3')
    type('B 絵馬 開店時の在庫', '10')
    type('B 絵馬 残数', '4')

    expect(summary('a')).toBe('￥2,000-')
    expect(summary('b')).toBe('￥3,000-')
    expect(text('#results [data-section="a"] .stock-breakdown')).toBe('ステッカー 2個')
    expect(text('.stock-grand')).toBe('合計（A＋B）￥5,000-')
  })

  it('入れた数を保存し、開き直す（＝リロード）と同じ数と結果に戻る', () => {
    const { storage } = mount()
    type('A 絵馬 開店時の在庫', '8')
    type('A 絵馬 残数', '2')

    mount(storage)
    expect(document.querySelector<HTMLInputElement>('#a-ema-start')!.value).toBe('8')
    expect(result('a-ema')).toBe('売れた 6個 → ￥3,000-')
    expect(text('.save-status')).toBe('この端末に保存済み（最終更新 10:00）')
  })

  it('欄を空にすると未入力に戻り、0 とは区別する', () => {
    mount()
    type('A 絵馬 開店時の在庫', '8')
    type('A 絵馬 残数', '0')
    expect(result('a-ema')).toBe('売れた 8個 → ￥4,000-')
    type('A 絵馬 残数', '')
    expect(result('a-ema')).toBe('在庫 8個（残数を入れると計算します）')
  })

  it('負の数・小数は記録せず、欄から離れると記録どおりに戻す', () => {
    mount()
    type('A 絵馬 開店時の在庫', '8')
    const input = type('A 絵馬 開店時の在庫', '-3')
    expect(input.value).toBe('8')
    type('A 絵馬 開店時の在庫', '2.5')
    expect(input.value).toBe('8')
  })

  it('残数が在庫より多いと知らせ、売上には入れない', () => {
    mount()
    type('A ステッカー 開店時の在庫', '5')
    type('A ステッカー 残数', '7')
    expect(result('a-sticker')).toBe('残数が在庫（5個）より多くなっています')
    expect(document.querySelector('#a-sticker-remaining')!.classList.contains('mismatch')).toBe(true)
    expect(summary('a')).toBe('￥0-')
    expect(text('[data-section="a"] .stock-note')).toContain('要確認 1品目')
  })

  it('開店時の在庫がないまま残数を入れたら、開店時を入れるよう知らせる', () => {
    mount()
    type('B ステッカー 残数', '3')
    expect(result('b-sticker')).toBe('開店時の在庫を入れてください')
    expect(text('[data-section="b"] .stock-note')).toContain('入れかけ 1品目')
  })

  it('前の営業日の数字が残っていれば知らせ、残数を今日の開店時の在庫に移せる', () => {
    const storage = memoryStorage()
    const yesterday = new Date('2026-10-14T10:00:00+09:00')
    let state = setField(initialStockState(), 'a-sticker', 'start', 20, yesterday)
    state = setField(state, 'a-sticker', 'remaining', 12, yesterday)
    storage.setItem('hihoukan-calc:sample-stock:v1', JSON.stringify(state))

    mount(storage)
    expect(visibleAlerts()).toEqual([expect.stringContaining('10/14 10:00 から入れた数字が残っています')])

    holdPress('残数を今日の開店時の在庫にする')
    expect(visibleAlerts()).toEqual([])
    expect(document.querySelector<HTMLInputElement>('#a-sticker-start')!.value).toBe('12')
    expect(document.querySelector<HTMLInputElement>('#a-sticker-remaining')!.value).toBe('')
  })

  it('リセットは、タップしただけでは消さず、長押ししたときだけ全部消す', () => {
    mount()
    type('A 絵馬 開店時の在庫', '8')
    const reset = [...document.querySelectorAll<HTMLButtonElement>('button.hold-button')].find(
      (b) => b.querySelector('.hold-idle')?.textContent === 'リセット',
    )!
    reset.click()
    reset.click()
    expect(document.querySelector<HTMLInputElement>('#a-ema-start')!.value).toBe('8')
    holdPress('リセット')
    expect(document.querySelector<HTMLInputElement>('#a-ema-start')!.value).toBe('')
  })

  it('見出しをタブで切り替え、タブに売上と精算の印を出す', () => {
    mount()
    const tabs = () => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
    expect(tabs()).toEqual(['A ￥0', 'B ￥0'])
    expect(document.querySelector<HTMLElement>('#panel-a')!.hidden).toBe(false)
    expect(document.querySelector<HTMLElement>('#panel-b')!.hidden).toBe(true)
    type('A ステッカー 開店時の在庫', '5')
    type('A ステッカー 残数', '3')
    expect(tabs()).toEqual(['A ￥2,000', 'B ￥0'])
    document.querySelector<HTMLButtonElement>('#tab-b')!.click()
    expect(document.querySelector<HTMLElement>('#panel-b')!.hidden).toBe(false)
  })

  it('見出しごとにレジ精算をし、精算を終えると印が付く。そのあと数が変わったら知らせる', () => {
    mount()
    type('A ステッカー 開店時の在庫', '5')
    type('A ステッカー 残数', '3') // A の売上 2,000
    type('A 売上のポケット 千円札の枚数', '2')
    expect(text('#panel-a .cash-verdict')).toBe('ぴったり合っています。')
    expect(text('#panel-b .cash-verdict')).toBe('売上のポケットの枚数を入れると、Bの売上と比べます。')

    clock = new Date('2026-10-15T21:30:00+09:00')
    button('Aの精算を終える').click()
    expect(text('#tab-a')).toBe('A ￥2,000 ✓')
    expect(text('#panel-a .settle-status')).toBe('✓ 21:30 に精算を終えました。')

    type('A ステッカー 残数', '2')
    expect(text('#tab-a')).toBe('A ￥3,000 ！')
    expect(text('#panel-a .settle-status')).toBe('21:30 に精算したあとで数が変わりました。数え直したら、もう一度押してください。')
    expect(text('#panel-a .cash-verdict')).toBe('お金のほうが ￥1,000 少ない。残数の数えまちがいや、お釣りのまちがいがないか確かめてください（ステッカー 1つ分と同じ額）。')
  })

  it('保存できない端末では、消えることを知らせる', () => {
    mount(null)
    expect(visibleAlerts()).toEqual([expect.stringContaining('この端末では数字を保存できません')])
  })
})
