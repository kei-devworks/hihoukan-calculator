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
const result = (itemId: string) => text(`.stock-result[data-item="${itemId}"]`)
const summary = (sectionId: string) => text(`#results [data-section="${sectionId}"] .stock-summary-line b`)
const visibleAlerts = () =>
  [...document.querySelectorAll<HTMLElement>('[role="alert"]')].filter((el) => !el.hidden).map((el) => el.textContent)

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
    expect(document.querySelectorAll('.stock-grid input')).toHaveLength(4 * 3)
    expect(document.querySelector('input[aria-label="B 絵馬 途中で追加した数"]')).not.toBeNull()
    // 欄のあいだに ＋ と −（開店時 ＋ 追加 − 残数）
    expect([...document.querySelectorAll('[data-section="a"] .stock-op')].map((el) => el.textContent)).toEqual(['＋', '−', '＋', '−'])
  })

  it('欄の順は列ごと（キーボードの「↓」・Tab で、残数の次は下の品目の残数）。「次へ」（Enter）も下の品目の同じ欄へ', () => {
    mount()
    expect([...document.querySelectorAll<HTMLInputElement>('[data-section="a"] .stock-grid input')].map((el) => el.id)).toEqual([
      'a-sticker-start',
      'a-ema-start',
      'a-sticker-added',
      'a-ema-added',
      'a-sticker-remaining',
      'a-ema-remaining',
    ])
    const sticker = document.querySelector<HTMLInputElement>('#a-sticker-remaining')!
    const ema = document.querySelector<HTMLInputElement>('#a-ema-remaining')!
    expect([sticker.getAttribute('enterkeyhint'), ema.getAttribute('enterkeyhint')]).toEqual(['next', 'done'])
    sticker.focus()
    sticker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(ema)
    ema.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(ema)
  })

  it('レジ精算の釣り銭準備金も、開店時の列 → いまの列の順', () => {
    mount()
    expect([...document.querySelectorAll<HTMLInputElement>('#panel-a .float-grid input')].map((el) => el.id)).toEqual([
      'cash-a-floatStart-500',
      'cash-a-floatStart-100',
      'cash-a-floatNow-500',
      'cash-a-floatNow-100',
    ])
  })

  it('開店時・追加・残数から、売れた数と売上を出す', () => {
    mount()
    type('A ステッカー 開店時の在庫', '20')
    expect(result('a-sticker')).toBe('在庫 20個（残数を入れると計算します）')
    type('A ステッカー 途中で追加した数', '10')
    type('A ステッカー 残数', '12')
    expect(result('a-sticker')).toBe('＝ 売れた 18個 → ￥18,000-')
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
    expect(result('a-ema')).toBe('＝ 売れた 6個 → ￥3,000-')
    expect(text('.save-status')).toBe('この端末に保存済み（最終更新 10:00）')
  })

  it('欄を空にすると未入力に戻り、0 とは区別する', () => {
    mount()
    type('A 絵馬 開店時の在庫', '8')
    type('A 絵馬 残数', '0')
    expect(result('a-ema')).toBe('＝ 売れた 8個 → ￥4,000-')
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

  it('見出しごとにレジ精算をし、［精算を完了する］で記録が残る。数が変わるまでは押せず、変わったらもう一度完了でき、前の記録も残る', () => {
    mount()
    type('A ステッカー 開店時の在庫', '5')
    type('A ステッカー 残数', '3') // A の売上 2,000
    const settleButton = () => document.querySelector<HTMLButtonElement>('#panel-a .settle-button')!
    const records = () => [...document.querySelectorAll('#panel-a .settle-row')].map((el) => el.textContent)
    // ボタンはレジ精算の中（計算の下）。ポケットを数えるまでは押せない
    expect(document.querySelector('#panel-a .cash .settle-button')).not.toBeNull()
    expect(settleButton().disabled).toBe(true)
    expect(settleButton().textContent).toBe('売上のポケットを数えると、精算を完了できます')
    expect(records()).toEqual([])

    type('A 売上のポケット 千円札の枚数', '2')
    expect(text('#panel-a .cash-verdict')).toBe('ぴったり合っています。')
    expect(text('#panel-b .cash-verdict')).toBe('売上のポケットの枚数を入れると、在庫から出した売上と比べます。')
    expect(text('#panel-a .cash-diff')).toBe('￥0')
    expect(settleButton().textContent).toBe('精算を完了する（差 ￥0）')

    clock = new Date('2026-10-15T14:00:00+09:00')
    settleButton().click()
    expect(text('#tab-a')).toBe('A ￥2,000 ✓')
    expect(text('#panel-a .settle-status')).toBe('✓ 14:00 に精算を完了しました（1回目）。')
    expect(records()).toEqual(['1回目14:00差 ￥0在庫から ￥2,000・お金から ￥2,000'])
    // 数が変わるまでは押せない（押し放題にしない）
    expect(settleButton().disabled).toBe(true)
    expect(settleButton().textContent).toBe('精算は完了しています')

    // 数が変わったら知らせ、もう一度完了できる。前の記録は残る
    type('A ステッカー 残数', '2') // 3,000
    expect(text('#tab-a')).toBe('A ￥3,000 ！')
    expect(text('#panel-a .settle-status')).toBe(
      '14:00 の精算（1回目）のあとで数が変わりました。数え終えたら、もう一度完了してください（前の記録は残ります）。',
    )
    expect(text('#panel-a .cash-verdict')).toBe('お金のほうが ￥1,000 少ない。残数の数えまちがいや、お釣りのまちがいがないか確かめてください（ステッカー 1つ分と同じ額）。')
    expect(settleButton().textContent).toBe('もう一度完了する（2回目・差 −￥1,000）')
    clock = new Date('2026-10-15T21:30:00+09:00')
    settleButton().click()
    expect(records()).toEqual([
      '1回目14:00差 ￥0在庫から ￥2,000・お金から ￥2,000',
      '2回目21:30差 −￥1,000在庫から ￥3,000・お金から ￥2,000',
    ])
    expect(text('#tab-a')).toBe('A ￥3,000 ✓')
  })

  it('保存できない端末では、消えることを知らせる', () => {
    mount(null)
    expect(visibleAlerts()).toEqual([expect.stringContaining('この端末では数字を保存できません')])
  })
})
