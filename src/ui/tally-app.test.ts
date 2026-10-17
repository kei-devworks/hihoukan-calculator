// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleConfig as config } from '../core/fixtures'
import { memoryStorage, type KeyValueStorage } from '../core/storage'
import { mountTallyApp, type TallyApp } from './tally-app'

let app: TallyApp | undefined
let clock: Date

function mount(storage: KeyValueStorage | null = memoryStorage()) {
  app?.unmount()
  const root = document.createElement('main')
  document.body.replaceChildren(root)
  app = mountTallyApp(root, config, { storage, now: () => clock })
  return { root, storage }
}

const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  )
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
const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''
const visibleAlerts = () =>
  [...document.querySelectorAll<HTMLElement>('[role="alert"]')].filter((el) => !el.hidden).map((el) => el.textContent)

beforeEach(() => {
  clock = new Date('2026-10-15T20:40:00+09:00')
})

afterEach(() => {
  app?.unmount()
  app = undefined
})

describe('mountTallyApp', () => {
  it('設定どおりに品目を並べ、報告時刻はいまに一番近い「ちょうど」', () => {
    mount()
    expect([...document.querySelectorAll('.row .nm')].map((el) => el.textContent)).toEqual([
      '1,000円',
      '2,000円',
      'ホタテ',
      'バニラ',
      '抹茶',
    ])
    expect(document.querySelector<HTMLInputElement>('#report-time')!.value).toBe('21:00')
    expect(text('#report')).toContain('21:00時点')
  })

  it('＋/− で個数・小計・合計・報告文が変わる', () => {
    mount()
    button('1,000円を1つ増やす').click()
    button('1,000円を1つ増やす').click()
    button('バニラを1つ増やす').click()
    button('1,000円を1つ減らす').click()

    expect(text('[data-item="a"] .n')).toBe('1')
    expect(text('#total')).toBe('￥1,800-')
    expect(text('#report')).toContain('1,000×1\n小計￥1,000-')
    expect(text('#report')).toContain('バニラ×1\n小計￥800-')
  })

  it('数えるたびに保存し、開き直す（＝リロード）と同じ数に戻る', () => {
    const { storage } = mount()
    button('ホタテを1つ増やす').click()
    button('抹茶を1つ増やす').click()

    mount(storage)
    expect(text('[data-item="hotate"] .n')).toBe('1')
    expect(text('[data-item="matcha"] .n')).toBe('1')
    expect(text('#total')).toBe('￥1,800-')
    expect(text('.save-status')).toBe('この端末に保存済み（最終更新 20:40）')
  })

  it('リセットは、タップしただけでは 0 にせず、長押ししたときだけ 0 に戻す', () => {
    const { storage } = mount()
    button('ホタテを1つ増やす').click()

    const reset = document.querySelector<HTMLButtonElement>('button.hold-button')!
    reset.click()
    reset.click()
    expect(text('#total')).toBe('￥1,000-')
    holdPress('リセット')
    expect(text('#total')).toBe('￥0-')

    mount(storage)
    expect(text('#total')).toBe('￥0-')
  })

  it('単価を変えると、名前・合計・保存に反映し、要約に「変更あり」と出す', () => {
    const { storage } = mount()
    button('1,000円を1つ増やす').click()

    const input = document.querySelector<HTMLInputElement>('#price-a')!
    input.value = '1200'
    input.dispatchEvent(new Event('input'))

    expect(text('[data-item="a"] .nm')).toBe('1,200円')
    expect(text('#total')).toBe('￥1,200-')
    expect(text('details.prices summary')).toBe('単価設定（1件 変更あり）')

    mount(storage)
    expect(text('#total')).toBe('￥1,200-')
  })

  it('単価の欄を空にしても 0 円にはせず、欄から離れると元の値に戻す', () => {
    mount()
    const input = document.querySelector<HTMLInputElement>('#price-soft')!
    input.value = ''
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new Event('blur'))
    expect(input.value).toBe('800')
    expect(text('[data-item="vanilla"] .pr')).toBe('¥800')
  })

  it('前の営業日に数え始めた数字が残っていれば知らせ、0 に戻すと消える', () => {
    const storage = memoryStorage()
    // 前の日に数えた版 1 の保存が残っている（版 1 からの読み替えも兼ねて確かめる）
    const yesterday = new Date('2026-10-14T18:00:00+09:00').toISOString()
    storage.setItem('hihoukan-calc:sample:v1', JSON.stringify({ counts: { a: 2 }, updatedAt: yesterday, startedAt: yesterday }))

    mount(storage)
    expect(visibleAlerts()).toEqual([expect.stringContaining('10/14 18:00 から数えた数字が残っています')])
    // 今日の分を足しても知らせは消えない
    button('2,000円を1つ増やす').click()
    expect(visibleAlerts()).toHaveLength(1)

    holdPress('0 に戻して今日を始める')
    expect(visibleAlerts()).toEqual([])
    expect(text('#total')).toBe('￥0-')
  })

  it('深夜営業で日付をまたいでも、同じ営業日なら知らせない', () => {
    const storage = memoryStorage()
    const evening = new Date('2026-10-15T18:00:00+09:00').toISOString()
    storage.setItem('hihoukan-calc:sample:v1', JSON.stringify({ counts: { a: 2 }, updatedAt: evening, startedAt: evening }))
    clock = new Date('2026-10-16T01:30:00+09:00')
    mount(storage)
    expect(visibleAlerts()).toEqual([])
  })

  it('保存できない端末では、消えることを知らせる', () => {
    mount(null)
    button('ホタテを1つ増やす').click()
    expect(text('#total')).toBe('￥1,000-')
    expect(visibleAlerts()).toEqual([expect.stringContaining('この端末では数字を保存できません')])
  })

  it('報告時刻を手で変えたら、その時刻で報告文を作り、「今」で戻す', () => {
    mount()
    const time = document.querySelector<HTMLInputElement>('#report-time')!
    time.value = '19:00'
    time.dispatchEvent(new Event('input'))
    expect(text('#report')).toContain('19:00時点')

    button('今').click()
    expect(time.value).toBe('21:00')
  })
})
