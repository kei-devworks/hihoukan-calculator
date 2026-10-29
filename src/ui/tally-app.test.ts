// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleConfig as config } from '../core/fixtures'
import { makeHandoverCode } from '../core/handover'
import { encodeHandoverCode } from '../core/handover-code'
import { addItem } from '../core/orders'
import { initialState } from '../core/tally'
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
    // 画面の見出しに ◾️ は付けない（報告文にだけ付ける）
    expect([...document.querySelectorAll('.card[data-section] h2')].map((el) => el.textContent)).toEqual(['肉', 'ソフト'])
    expect(text('#report')).toContain('\n◾️肉\n')
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
    expect(text('#prices-title')).toBe('品目と単価（単価 1件 変更あり）')

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

    it('［会計 ￥3,000］［完了］はいちばん下に大きく、［このオーダーを取り消す］は上の段の左に置く', () => {
      mount()
      button('1,000円を1つ増やす').click()
      button('1,000円を1つ増やす').click()
      button('ホタテを1つ増やす').click()
      const big = panel().querySelector('.order-big')!
      expect([...big.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['会計￥3,000', '完了'])
      expect(panel().lastElementChild).toBe(big)
      const cancel = panel().querySelector('.order-cancel')!
      expect(cancel.firstElementChild!.querySelector('.hold-idle')?.textContent).toBe('このオーダーを取り消す')
      expect(cancel.compareDocumentPosition(panel().querySelector('.order-lines')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

    it('ほかの画面にいるあいだは小さく出し、押すと「注文」に戻る', () => {
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
      button('会計￥2,800').click()
    }

    const shown = (selector: string) => !sheet()!.querySelector<HTMLElement>(selector)!.hidden
    const receiptRows = () => [...sheet()!.querySelectorAll('.receipt-items > *')].map((el) => el.textContent)

    it('お客様に見せるレシート: 品目をジャンルにまとめ、英語を先に出す。押した額面を預かりに足してお釣りを出す', () => {
      order2500()
      expect(sheet()!.getAttribute('aria-label')).toBe('お会計（20:40 のオーダー）')
      expect(text('.receipt-head')).toBe('Checkout お会計20:40')
      expect(receiptRows()).toEqual([
        'Wagyu A5 A5和牛',
        '¥2,000',
        '×1',
        '¥2,000',
        'Cremia Soft Serve クレミア ソフトクリーム',
        'Vanilla バニラ',
        '×1',
        '¥800',
      ])
      expect(text('.checkout-total')).toBe('¥2,800')
      expect(text('.checkout-tendered')).toBe('—')
      expect(text('.checkout-breakdown')).toBe('受け取ったお札・硬貨を押す')
      expect(shown('.checkout-change')).toBe(false)
      expect(shown('.receipt-thanks')).toBe(false)
      // 押すたびに足すことがわかるよう、ボタンには ＋ を付ける（係の人の操作なので日本語のまま）
      expect([...sheet()!.querySelectorAll('.tenders button')].map((b) => b.textContent)).toEqual([
        '＋10,000',
        '＋5,000',
        '＋1,000',
        '＋500',
        '＋100',
        '1つ戻す',
        '0に戻す',
      ])
      inSheet('1,000円を預かりに足す').click()
      inSheet('1,000円を預かりに足す').click()
      expect(text('.checkout-change')).toBe('Amount due あと¥800')
      expect(shown('.receipt-thanks')).toBe(false)
      inSheet('1,000円を預かりに足す').click()
      expect(text('.checkout-tendered')).toBe('¥3,000')
      expect(text('.checkout-breakdown')).toBe('¥1,000×3')
      expect(text('.checkout-change')).toBe('Change お釣り¥200')
      expect(shown('.receipt-thanks')).toBe(true)
    })

    it('1品だけのジャンルは1行。ジャンルに入らない品目は日本語名のまま1行', () => {
      mount()
      button('ホタテを1つ増やす').click()
      button('ホタテを1つ増やす').click()
      button('抹茶を1つ増やす').click()
      button('会計￥2,800').click()
      expect(receiptRows()).toEqual(['Scallop ホタテ', '×2', '¥2,000', '抹茶', '×1', '¥800'])
    })

    it('［1つ戻す］［0に戻す］で押しまちがいを直せる。ちょうどなら「No change」', () => {
      order2500()
      inSheet('5,000円を預かりに足す').click()
      inSheet('1つ戻す').click()
      expect(text('.checkout-tendered')).toBe('—')
      inSheet('1,000円を預かりに足す').click()
      inSheet('1,000円を預かりに足す').click()
      inSheet('500円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      inSheet('100円を預かりに足す').click()
      expect(text('.checkout-breakdown')).toBe('¥1,000×2, ¥500×1, ¥100×3')
      expect(text('.checkout-change')).toBe('Change お釣りNo change')
      inSheet('0に戻す').click()
      expect(shown('.checkout-change')).toBe(false)
      expect(text('.checkout-breakdown')).toBe('受け取ったお札・硬貨を押す')
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

  describe('レジ精算', () => {
    const fill = (id: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(`#${id}`)!
      input.value = value
      input.dispatchEvent(new Event('input'))
    }

    it('ポケットの枚数と、釣り銭準備金の開店時・いまから「お金から出した売上」を出し、注文から出した売上を引いて差を出す', () => {
      mount()
      button('2,000円を1つ増やす').click()
      button('ホタテを1つ増やす').click() // 3,000
      button('レジ精算').click()
      expect(text('.cash-verdict')).toBe('売上のポケットの枚数を入れると、注文から出した売上と比べます。')
      // 筆算: 名前の列は「−」を含まない。ポケットを数えるまで差は出さない
      expect([...document.querySelectorAll('.cash-calc-op + *')].map((el) => el.textContent)).toEqual([
        'ポケットの合計',
        '使った釣り銭',
        'お金から出した売上',
        '注文から出した売上',
        '差',
      ])
      expect([...document.querySelectorAll('.cash-calc-op')].map((el) => el.textContent)).toEqual(['', '−', '', '−', ''])
      expect(text('.cash-diff')).toBe('—')
      fill('cash-pocket-1000', '4')
      fill('cash-floatStart-100', '30')
      fill('cash-floatNow-100', '20') // 1,000 使った
      expect(text('.cash-sales')).toBe('￥3,000')
      expect(text('.cash-diff')).toBe('￥0')
      expect(document.querySelector<HTMLElement>('.cash-diff')!.dataset.tone).toBe('ok')
      expect(text('.cash-verdict')).toBe('ぴったり合っています。')
      fill('cash-floatNow-100', '22') // 使ったのは 800 → お金から出した売上 3,200
      expect(text('.cash-diff')).toBe('＋￥200')
      expect(text('.cash-verdict')).toBe('お金のほうが ￥200 多い。押し忘れがないか記録を見てください。')
      // ポケット 3,600 − 使った 800 ＝ 2,800 で、3,000 より 200 少ない
      fill('cash-pocket-1000', '3')
      fill('cash-pocket-500', '1')
      fill('cash-pocket-100', '1')
      expect(text('.cash-diff')).toBe('−￥200')
      expect(document.querySelector<HTMLElement>('.cash-diff')!.dataset.tone).toBe('warn')
      expect(text('.cash-verdict')).toBe('お金のほうが ￥200 少ない。押しまちがいやお釣りのまちがいがないか確かめてください。')
    })

    it('差がどれかの単価と同じなら、その品目を添える（単価を共有する品目は単価の名前）', () => {
      mount()
      button('バニラを1つ増やす').click() // 800
      button('レジ精算').click()
      fill('cash-pocket-1000', '1')
      fill('cash-pocket-500', '1')
      fill('cash-pocket-100', '1') // 1,600
      expect(text('.cash-verdict')).toBe('お金のほうが ￥800 多い。押し忘れがないか記録を見てください（ソフト（共通） 1つ分と同じ額）。')
    })

    it('［使っていない］でいまの準備金を開店時と同じにし、数えていなければ知らせる', () => {
      mount()
      button('レジ精算').click()
      fill('cash-pocket-1000', '1')
      fill('cash-floatStart-500', '6')
      expect(text('.cash-verdict.warn:not([aria-live])')).toContain('いまの釣り銭準備金を数えるか')
      button('使っていない').click()
      expect(document.querySelector<HTMLInputElement>('#cash-floatNow-500')!.value).toBe('6')
      expect(document.querySelectorAll('.cash-verdict.warn:not([hidden])')).toHaveLength(1)
    })

    it('枚数は保存し、リセットではポケットといまの枚数を消して開店時の枚数を残す（レジ精算に枚数だけを消すボタンは置かない）', () => {
      const { storage } = mount()
      button('レジ精算').click()
      expect(document.querySelectorAll('.cash button.hold-button')).toHaveLength(0)
      fill('cash-pocket-1000', '3')
      fill('cash-floatStart-100', '30')
      fill('cash-floatNow-100', '25')
      mount(storage)
      expect(document.querySelector<HTMLInputElement>('#cash-pocket-1000')!.value).toBe('3')
      holdPress('リセット')
      expect(document.querySelector<HTMLInputElement>('#cash-pocket-1000')!.value).toBe('')
      expect(document.querySelector<HTMLInputElement>('#cash-floatStart-100')!.value).toBe('30')
      expect(document.querySelector<HTMLInputElement>('#cash-floatNow-100')!.value).toBe('')
    })
  })

  describe('品目を足す', () => {
    const fill = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    const names = (sectionId: string) => [...document.querySelectorAll(`[data-section="${sectionId}"] .row .nm`)].map((el) => el.textContent)
    /** その見出しの［足す］（見出しごとに同じ名前のボタンがあるので、見出しの中を探す） */
    const addIn = (sectionId: string) =>
      document.querySelector<HTMLButtonElement>(`.items-section[data-section="${sectionId}"] .add-item-actions .solid`)!.click()

    it('見出しに品目を足すと、カードの最後に ＋/− つきで出て、報告文にも入る。保存もされる', () => {
      const { storage } = mount()
      button('品目').click()
      button('＋ ソフトに品目を足す').click()
      fill('#new-name-soft', 'チョコトッピング')
      fill('#new-price-soft', '100')
      addIn('soft')
      expect(text('.notice-bar-text')).toBe('チョコトッピング（￥100）をソフトに足しました')
      expect(names('soft')).toEqual(['バニラ', '抹茶', 'チョコトッピング'])
      expect(text('#prices-title')).toBe('品目と単価（1品目 追加）')

      button('注文').click()
      button('チョコトッピングを1つ増やす').click()
      expect(text('#report')).toContain('チョコトッピング×1\n小計￥100-')
      expect(text('#total')).toBe('￥100-')

      mount(storage)
      expect(names('soft')).toEqual(['バニラ', '抹茶', 'チョコトッピング'])
      expect(text('#total')).toBe('￥100-')
    })

    it('名前を空にすると値段で呼ぶ。単価がなければ足さない', () => {
      mount()
      button('品目').click()
      button('＋ 肉に品目を足す').click()
      addIn('meat')
      expect(document.querySelector<HTMLElement>('[data-section="meat"] .add-item-error')!.hidden).toBe(false)
      fill('#new-price-meat', '7000')
      addIn('meat')
      expect(names('meat')).toEqual(['1,000円', '2,000円', 'ホタテ', '7,000円'])
    })

    it('足した品目の名前と単価はその場で直せ、長押しで消せる（知らせから元に戻せる）', () => {
      mount()
      button('品目').click()
      button('＋ ソフトに品目を足す').click()
      fill('#new-name-soft', 'チョコ')
      fill('#new-price-soft', '100')
      addIn('soft')
      const id = document.querySelector<HTMLElement>('.custom-row')!.dataset.item!
      fill(`#custom-name-${id}`, 'チョコトッピング')
      fill(`#custom-price-${id}`, '150')
      expect(names('soft')).toEqual(['バニラ', '抹茶', 'チョコトッピング'])
      expect(text(`[data-item="${id}"] .pr`)).toBe('¥150')

      button('注文').click()
      button('チョコトッピングを1つ増やす').click()
      button('品目').click()
      holdPress('消す')
      expect(names('soft')).toEqual(['バニラ', '抹茶'])
      expect(text('#total')).toBe('￥0-')
      expect(text('.notice-bar-text')).toBe('チョコトッピングを消しました（今日の 1個 も消しました）')
      button('元に戻す').click()
      expect(names('soft')).toEqual(['バニラ', '抹茶', 'チョコトッピング'])
      expect(text('#total')).toBe('￥150-')
    })
  })
})

describe('引き継ぎ', () => {
  const fill = (selector: string, value: string) => {
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  /** 渡すか受け取るかのボタン（見出しと説明の2行） */
  const choice = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.handover-choice')].find((b) => b.querySelector('b')?.textContent === label)!
  const prev = (itemId: string) => document.querySelector<HTMLInputElement>(`#handover-n-${itemId}`)!
  const messages = () => [...document.querySelectorAll('.handover-msg')].map((el) => el.textContent)
  const goButton = () => document.querySelector<HTMLButtonElement>('dialog.handover .editor-foot button.solid')!
  /** 前の人の端末: 1,000円×3・ホタテ×1（20:30） */
  const senderCode = () => {
    let s = initialState()
    for (const id of ['a', 'a', 'a', 'hotate']) s = addItem(s, id, new Date('2026-10-15T20:30:00+09:00'))
    return makeHandoverCode(config, s, new Date('2026-10-15T20:35:00+09:00'))
  }

  afterEach(() => {
    history.replaceState(null, '', location.pathname)
  })

  it('［次の人に渡す］で、その時点の数の QR を出す', async () => {
    mount()
    button('1,000円を1つ増やす').click()
    button('ホタテを1つ増やす').click()
    button('引き継ぎ').click()
    choice('次の人に渡す').click()
    expect(text('.send-info b')).toBe('20:40時点・2点・￥2,000')
    await vi.waitFor(() => expect(document.querySelector('dialog.handover .qr-box svg')).not.toBeNull())
    expect(document.querySelector('dialog.handover .qr-box svg')!.getAttribute('aria-label')).toBe('引き継ぎの QR コード')
  })

  it('引き継ぎのリンクで開くと、読み込んだ状態で受け取りの画面が出る（種類はゼロから引き継ぐ）。リンクのデータは URL から消す', () => {
    location.hash = `hikitsugi=${encodeHandoverCode(senderCode())}`
    mount()
    expect(location.hash).toBe('')
    expect(text('#handover-title')).toBe('前の人から受け取る')
    expect(messages()[0]).toBe('前の人の 20:35時点（5分前）の数を読み取りました（2品目）。')
    expect(prev('a').value).toBe('3')
    expect(prev('hotate').value).toBe('1')
    expect(button('ゼロから引き継ぐ').getAttribute('aria-checked')).toBe('true')
    expect(button('休憩から戻った').getAttribute('aria-checked')).toBe('false')

    expect(messages()).toContain('前の人の数の合計は、前の人の合計 ￥4,000 と合っています。')
    expect(goButton().textContent).toBe('引き継ぐ（4点 ￥4,000）')
    goButton().click()
    expect(document.querySelector('dialog.handover')).toBeNull()
    expect(text('[data-item="a"] .n')).toBe('3')
    expect(text('#total')).toBe('￥4,000-')
    expect(text('.notice-bar-text')).toBe('前の人の数を引き継ぎました（4点 ￥4,000）')
    // 今のオーダーには入らない
    expect(document.querySelector('.order-panel .order-line')).toBeNull()
  })

  it('壊れたリンクで開くと知らせる', () => {
    location.hash = 'hikitsugi=abc'
    mount()
    expect(document.querySelector('dialog.handover')).toBeNull()
    expect(text('.notice-bar-text')).toBe('引き継ぎのリンクを読めませんでした。前の人に QR を出し直してもらってください。')
  })

  it('休憩から戻ったら、報告文を貼ると足りない分だけ足す。もう一度貼っても足す分はない', () => {
    mount()
    button('1,000円を1つ増やす').click()
    const report = '売上報告\n21:00時点\n\n◾️肉\n1,000×3\nホタテ×1\n小計￥4,000-\n\n◾️ソフト\n小計￥0-\n\n合計￥4,000-'
    const receive = () => {
      button('引き継ぎ').click()
      choice('前の人から受け取る').click()
      button('休憩から戻った').click()
      button('報告文を貼る').click()
      fill('.handover-paste', report)
    }
    receive()
    expect(messages()[0]).toBe('21:00時点の報告文を読み取りました（2品目）。')
    expect(text('[data-item="a"] .handover-change')).toBe('この端末 1個 ＋2 → 3個')
    expect(goButton().textContent).toBe('引き継ぐ（＋3点 ￥3,000）')
    goButton().click()
    expect(text('#total')).toBe('￥4,000-')
    expect(text('.notice-bar-text')).toBe('休憩のあいだに増えた分を足しました（＋3点 ￥3,000）')

    receive()
    expect(goButton().disabled).toBe(true)
    expect(goButton().textContent).toBe('足す分はありません')
  })

  it('ゼロから引き継ぐとき、この端末に記録があれば長押しで置き換える（取り消した記録は元に戻せる）', () => {
    mount()
    button('抹茶を1つ増やす').click()
    button('引き継ぎ').click()
    choice('前の人から受け取る').click()
    button('打ち込む').click()
    fill('#handover-n-b', '2')
    expect(messages()).toContain('この端末に残っている記録（1点 ￥800）は取り消して、前の人の数に置き換えます。取り消した記録は［記録］の画面から元に戻せます。')
    expect(messages()).toContain('前の人の画面の合計が ￥4,000 か確かめてください。')

    holdPress('置き換えて引き継ぐ（2点 ￥4,000）')
    expect(text('[data-item="matcha"] .n')).toBe('0')
    expect(text('[data-item="b"] .n')).toBe('2')
    button('記録').click()
    expect(document.querySelector('.log-handover')?.textContent).toContain('前の人の数（打ち込み）')
    button('20:40 のオーダーを元に戻す')
  })
})
