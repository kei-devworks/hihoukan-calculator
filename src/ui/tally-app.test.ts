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

  it('リセットのあとは、知らせの［元に戻す］で戻せる', () => {
    mount()
    button('ホタテを1つ増やす').click()
    holdPress('リセット')
    expect(text('.notice-bar-text')).toBe('全部 0 にしました')
    button('元に戻す').click()
    expect(text('#total')).toBe('￥1,000-')
    expect(text('.notice-bar-text')).toBe('元に戻しました')
  })

  it('− で前のオーダーから減らしたときは、どのオーダーから減ったかを知らせ、戻せる', () => {
    mount()
    button('ホタテを1つ増やす').click()
    clock = new Date('2026-10-15T20:45:00+09:00') // 3分すぎた。今のオーダーではなくなる
    button('ホタテを1つ減らす').click()
    expect(text('#total')).toBe('￥0-')
    expect(text('.notice-bar-text')).toBe('20:40 のオーダーからホタテを1つ減らしました')
    button('元に戻す').click()
    expect(text('#total')).toBe('￥1,000-')
  })

  it('今のオーダーから − したときは知らせず、ほかの操作をすると知らせは消える', () => {
    mount()
    button('ホタテを1つ増やす').click()
    button('ホタテを1つ減らす').click()
    expect(document.querySelector<HTMLElement>('.notice-bar')!.hidden).toBe(true)

    button('ホタテを1つ増やす').click()
    holdPress('リセット')
    expect(document.querySelector<HTMLElement>('.notice-bar')!.hidden).toBe(false)
    button('バニラを1つ増やす').click()
    expect(document.querySelector<HTMLElement>('.notice-bar')!.hidden).toBe(true)
  })

  it('単価を変えると、名前・合計・保存に反映し、要約に「変更あり」と出す', () => {
    const { storage } = mount()
    button('1,000円を1つ増やす').click()

    const input = document.querySelector<HTMLInputElement>('#price-a')!
    input.value = '1200'
    input.dispatchEvent(new Event('input'))

    expect(text('[data-item="a"] .nm')).toBe('1,200円')
    expect(text('#total')).toBe('￥1,200-')
    expect(text('#prices-title')).toBe('単価設定（1件 変更あり）')

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

  describe('今のオーダー（画面の下）', () => {
    const panel = () => document.querySelector<HTMLElement>('.order-panel:not(.view)')!
    const lines = () => [...panel().querySelectorAll('.order-line')].map((l) => l.textContent)
    const chip = () => document.querySelector<HTMLButtonElement>('.order-chip')!

    it('＋ を押すと出て、品目ごとに「元の数 ＋足した数 → 今日の数」を並べる', () => {
      mount()
      expect(panel().hidden).toBe(true)
      button('1,000円を1つ増やす').click()
      button('1,000円を1つ増やす').click()
      button('ホタテを1つ増やす').click()
      expect(panel().hidden).toBe(false)
      expect(text('.order-panel .order-sum')).toBe('今のオーダー 20:40〜3点￥3,000')
      expect(lines()).toEqual(['1,000円0個 ＋2 → 2個−＋', 'ホタテ0個 ＋1 → 1個−＋'])
    })

    it('前のオーダーの数は「元の数」に入る。パネルの −/＋ でも直せる', () => {
      mount()
      button('ホタテを1つ増やす').click()
      clock = new Date('2026-10-15T20:45:00+09:00')
      button('ホタテを1つ増やす').click()
      expect(lines()).toEqual(['ホタテ1個 ＋1 → 2個−＋'])
      button('今のオーダーのホタテを1つ増やす').click()
      expect(lines()).toEqual(['ホタテ1個 ＋2 → 3個−＋'])
      button('今のオーダーのホタテを1つ減らす').click()
      button('今のオーダーのホタテを1つ減らす').click()
      expect(panel().hidden).toBe(true)
      expect(text('#total')).toBe('￥1,000-')
    })

    it('［完了］で閉じると「前のオーダー」を小さく出し、押すと中身を出し直す', () => {
      mount()
      button('1,000円を1つ増やす').click()
      button('バニラを1つ増やす').click()
      button('完了').click()
      expect(panel().hidden).toBe(true)
      expect(chip().textContent).toBe('前のオーダー 20:40・2点 ￥1,800 ›')
      chip().click()
      const view = document.querySelector<HTMLElement>('.order-panel.view')!
      expect(view.hidden).toBe(false)
      expect([...view.querySelectorAll('.order-line')].map((l) => l.textContent)).toEqual(['1,000円×1', 'バニラ×1'])
      button('前のオーダーを閉じる').click()
      expect(view.hidden).toBe(true)
      expect(chip().hidden).toBe(false)
    })

    it('［このオーダーを取り消す］は長押しで取り消し、知らせから元に戻せる', () => {
      mount()
      button('ホタテを1つ増やす').click()
      button('バニラを1つ増やす').click()
      holdPress('このオーダーを取り消す')
      expect(text('#total')).toBe('￥0-')
      expect(panel().hidden).toBe(true)
      expect(text('.notice-bar-text')).toBe('20:40 のオーダー（￥1,800）を取り消しました')
      button('元に戻す').click()
      expect(text('#total')).toBe('￥1,800-')
    })

    it('最後に押してから3分たつと、自動で閉じる', () => {
      vi.useFakeTimers()
      try {
        mount()
        button('ホタテを1つ増やす').click()
        clock = new Date('2026-10-15T20:43:00+09:00')
        vi.advanceTimersByTime(3 * 60_000 + 100)
        expect(panel().hidden).toBe(true)
        expect(chip().textContent).toBe('前のオーダー 20:40・1点 ￥1,000 ›')
      } finally {
        vi.useRealTimers()
      }
    })

    it('ほかの画面にいるあいだは小さく出し、押すと「数える」に戻る', () => {
      mount()
      button('ホタテを1つ増やす').click()
      button('品目').click()
      expect(panel().hidden).toBe(true)
      expect(chip().textContent).toBe('今のオーダー 20:40〜・1点 ￥1,000 ›')
      chip().click()
      expect(document.querySelector('#tab-count')?.getAttribute('aria-selected')).toBe('true')
      expect(panel().hidden).toBe(false)
    })
  })

  describe('オーダーの編集', () => {
    const dialog = () => document.querySelector<HTMLDialogElement>('dialog.order-editor')
    /** 編集の画面の中のボタン（品目のカードと同じ名前のボタンがあるので、画面の中だけを探す） */
    const inDialog = (name: string) => {
      const found = [...dialog()!.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === name || b.textContent === name,
      )
      if (!found) throw new Error(`編集の画面にボタン「${name}」がありません`)
      return found
    }
    /** 1件のオーダー（1,000円×2・ホタテ×1）を作って閉じ、前のオーダーから編集を開く */
    const openEditor = () => {
      mount()
      button('1,000円を1つ増やす').click()
      button('1,000円を1つ増やす').click()
      button('ホタテを1つ増やす').click()
      button('完了').click()
      document.querySelector<HTMLButtonElement>('.order-chip')!.click()
      button('編集').click()
    }

    it('前のオーダーの［編集］で開き、下書きを変えても保存するまで数は変わらない', () => {
      openEditor()
      expect(dialog()?.open).toBe(true)
      expect(text('#order-editor-title')).toBe('20:40 のオーダーを編集')
      inDialog('1,000円を1つ減らす').click()
      expect(text('.editor-summary')).toBe('変更前 ￥3,000 → 変更後 ￥2,000（−￥1,000）')
      expect(text('.editor-row.changed .editor-from')).toBe('2 →')
      expect(text('#total')).toBe('￥3,000-')
      inDialog('やめる').click()
      expect(dialog()).toBeNull()
      expect(text('#total')).toBe('￥3,000-')
    })

    it('［変更を保存］で直し、知らせから元に戻せる。ほかの品目も足せる', () => {
      openEditor()
      inDialog('1,000円を1つ減らす').click()
      inDialog('＋ 品目を足す').click()
      inDialog('＋ バニラ').click()
      inDialog('変更を保存').click()
      expect(dialog()).toBeNull()
      expect(text('#total')).toBe('￥2,800-')
      expect(text('.notice-bar-text')).toBe('20:40 のオーダーを変更しました（1,000円 2→1・バニラ 0→1）')
      button('元に戻す').click()
      expect(text('#total')).toBe('￥3,000-')
    })

    it('変えていなければ保存できない', () => {
      openEditor()
      expect(inDialog('変更を保存').disabled).toBe(true)
    })

    it('変更の記録から、変更の前に戻せる', () => {
      openEditor()
      inDialog('ホタテを1つ増やす').click()
      inDialog('変更を保存').click()
      expect(text('#total')).toBe('￥4,000-')
      document.querySelector<HTMLButtonElement>('.order-chip')!.click()
      button('編集').click()
      expect(text('.editor-history h3')).toBe('変更の記録（1回）')
      expect(text('.editor-history-row span')).toBe('20:40 ホタテ 1→2')
      inDialog('この変更の前に戻す').click()
      expect(text('#total')).toBe('￥3,000-')
      expect(text('.notice-bar-text')).toBe('20:40 のオーダーを変更の前に戻しました')
    })

    it('編集の画面からも、長押しでオーダーを取り消せる', () => {
      openEditor()
      const hold = dialog()!.querySelector<HTMLButtonElement>('button.hold-button')!
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        hold.click()
        hold.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
        vi.advanceTimersByTime(1000)
      } finally {
        vi.useRealTimers()
      }
      expect(dialog()).toBeNull()
      expect(text('#total')).toBe('￥0-')
      expect(text('.notice-bar-text')).toBe('20:40 のオーダー（￥3,000）を取り消しました')
    })
  })

  describe('記録の画面', () => {
    const at = (h: number, m: number) => new Date(`2026-10-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)
    const hours = () =>
      [...document.querySelectorAll<HTMLDetailsElement>('.log-hour')].map((d) => ({
        label: d.querySelector('.log-hour-label')?.textContent,
        open: d.open,
        warn: d.classList.contains('warn'),
        note: d.querySelector('.log-note')?.textContent ?? null,
      }))

    it('オーダーの数と最後の記録、1時間ごとの推移を出す。記録のない時間は黄色、いまの時間は開いておく', () => {
      clock = at(18, 10)
      mount()
      button('ホタテを1つ増やす').click()
      clock = at(20, 40)
      button('1,000円を1つ増やす').click()
      button('バニラを1つ増やす').click()
      clock = at(20, 46)
      button('記録').click()
      expect(text('.log-summary')).toBe('2オーダー・最後の記録 20:40（6分前）')
      expect(hours()).toEqual([
        { label: '18時台', open: false, warn: false, note: null },
        { label: '19時台', open: false, warn: true, note: '記録なし（押し忘れ？）' },
        { label: '20時台', open: true, warn: false, note: null },
      ])
      const latest = document.querySelector('.log-hour[open] .log-order')!
      expect(latest.querySelector('.log-items')?.textContent).toBe('1,000円 ×1バニラ ×1')
      expect(latest.querySelector('.log-yen')?.textContent).toBe('￥1,800')
    })

    it('記録の［編集］で直す画面を開き、取り消したオーダーは［元に戻す］で戻せる', () => {
      mount()
      button('ホタテを1つ増やす').click()
      holdPress('このオーダーを取り消す')
      button('記録').click()
      const row = document.querySelector('.log-order.cancelled')!
      expect(row.querySelector('.log-meta')?.textContent).toBe('取り消し済み（20:40）')
      button('20:40 のオーダーを元に戻す').click()
      expect(text('#total')).toBe('￥1,000-')
      expect(document.querySelector('.log-order.cancelled')).toBeNull()

      button('20:40 のオーダーを編集').click()
      expect(document.querySelector('dialog.order-editor')).not.toBeNull()
    })

    it('記録がなければ、そう知らせる', () => {
      mount()
      button('記録').click()
      expect(text('.log-empty')).toBe('まだ記録がありません。＋ を押すと、ここにオーダーごとに残ります。')
    })
  })

  describe('会計', () => {
    const sheet = () => document.querySelector<HTMLDialogElement>('dialog.checkout')
    const inSheet = (name: string) => {
      const found = [...sheet()!.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === name || b.textContent === name,
      )
      if (!found) throw new Error(`会計の画面にボタン「${name}」がありません`)
      return found
    }
    const order2500 = () => {
      mount()
      button('2,000円を1つ増やす').click()
      button('バニラを1つ増やす').click() // 2,000 + 800 = 2,800
      button('会計').click()
    }

    it('合計を出し、押した額面を預かりに足してお釣りを出す', () => {
      order2500()
      expect(text('#checkout-title')).toBe('お会計（20:40 のオーダー）')
      expect(text('.checkout-total')).toBe('￥2,800')
      expect(text('.checkout-lines')).toBe('2,000円×1・バニラ×1（2点）')
      expect(text('.checkout-change')).toBe('受け取ったお札・硬貨のボタンを押してください')
      inSheet('1,000円を預かりに足す').click()
      inSheet('1,000円を預かりに足す').click()
      expect(text('.checkout-change')).toBe('あと￥800')
      inSheet('1,000円を預かりに足す').click()
      expect(text('.checkout-tendered')).toBe('￥3,000')
      expect(text('.checkout-breakdown')).toBe('1,000×3')
      expect(text('.checkout-change')).toBe('お釣り￥200')
    })

    it('［1つ戻す］［0に戻す］で押しまちがいを直せる。ちょうどなら「なし」', () => {
      order2500()
      inSheet('5,000円を預かりに足す').click()
      inSheet('1つ戻す').click()
      expect(text('.checkout-tendered')).toBe('￥0')
      inSheet('1,000円を預かりに足す').click()
      inSheet('1,000円を預かりに足す').click()
      inSheet('500円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      expect(text('.checkout-breakdown')).toBe('1,000×2・500×1・100×3')
      expect(text('.checkout-change')).toBe('お釣りなし（ちょうど）')
      inSheet('0に戻す').click()
      expect(text('.checkout-change')).toBe('受け取ったお札・硬貨のボタンを押してください')
    })

    it('預かりはオーダーに残り、パネルにお釣りを出す。会計のあとの ＋ は次のお客さんになる', () => {
      order2500()
      inSheet('5,000円を預かりに足す').click()
      inSheet('戻る').click()
      expect(sheet()).toBeNull()
      expect(text('.order-panel .order-paid')).toBe('預かり ￥5,000 → お釣り ￥2,200。次の ＋ で次のお客さんになります')
      button('ホタテを1つ増やす').click()
      expect(text('.order-panel .order-sum')).toBe('今のオーダー 20:40〜1点￥1,000')
      button('記録').click()
      expect(text('.log-order[data-order="1"] .log-meta')).toBe('2点預かり ￥5,000 → お釣り ￥2,200')
    })

    it('［完了］でオーダーを閉じる', () => {
      order2500()
      inSheet('5,000円を預かりに足す').click()
      inSheet('完了').click()
      expect(sheet()).toBeNull()
      expect(document.querySelector<HTMLElement>('.order-panel:not(.view)')!.hidden).toBe(true)
      expect(text('.order-chip')).toBe('前のオーダー 20:40・2点 ￥2,800 ›')
    })
  })
})
