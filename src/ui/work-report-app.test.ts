// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, type KeyValueStorage } from '../core/storage'
import type { WorkReportConfig } from '../core/work-report'
import { mountWorkReportApp, type WorkReportApp } from './work-report-app'

const config: WorkReportConfig = {
  id: 'test-kinmu',
  title: '勤務時間報告',
  dayStartHour: 4,
  defaultShift: { start: '16:00', end: '23:00', breakMinutes: 0 },
}

let app: WorkReportApp | undefined
let clock: Date
let clipboard: string | null
let ids = 0

function mount(storage: KeyValueStorage | null = memoryStorage()) {
  app?.unmount()
  const root = document.createElement('main')
  document.body.replaceChildren(root)
  app = mountWorkReportApp(root, config, { storage, now: () => clock, newId: () => `p${++ids}` })
  return { storage }
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`${selector} がありません`)
  return el
}
const report = () => $('#report').textContent ?? ''
const lines = () => report().split('\n')
const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  )
  if (!found) throw new Error(`ボタン「${name}」がありません`)
  return found
}
const byLabel = <T extends HTMLElement>(label: string) => $<T>(`[aria-label="${label}"]`)

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change' = 'input') {
  el.value = value
  el.dispatchEvent(new Event(event, { bubbles: true }))
}

function addPattern(amount: string, from: string, to: string) {
  if ($('.pattern-editor').hidden) button('＋ パターンを追加').click()
  setValue(byLabel<HTMLInputElement>('交通費（往復）の金額'), amount)
  setValue(byLabel<HTMLInputElement>('駅（行き）'), from)
  setValue(byLabel<HTMLInputElement>('駅（帰り）'), to)
  $<HTMLFormElement>('.pattern-editor').requestSubmit()
}

async function copy() {
  button('コピーして報告する').click()
  await vi.waitFor(() => expect($('#after-copy').textContent).not.toBe(''))
}

beforeEach(() => {
  clock = new Date('2026-10-14T23:10:00+09:00')
  clipboard = null
  ids = 0
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void (clipboard = text) },
  })
})

afterEach(() => {
  app?.unmount()
  app = undefined
})

describe('mountWorkReportApp', () => {
  it('初めて開くと、今日の日付・既定の勤務時間で、受領済みの行はない', () => {
    mount()
    expect($<HTMLInputElement>('#work-date').value).toBe('2026-10-14')
    expect($('#work-date-text').textContent).toBe('10月14日(水曜日)')
    expect(lines()).toEqual(['勤務時間報告', '10月14日(水曜日)', '勤務時間\u300016:00 〜23:00', '休憩時間\u30000分', '交通費\u3000なし'])
    // 交通費のパターンを入れる欄が開いている
    expect($('.pattern-editor').hidden).toBe(false)
  })

  it('交通費のパターンを登録すると、例と同じ形の交通費の行になる（「駅」は付けても付けなくてもよい）', () => {
    mount()
    addPattern('500', '園田', 'なんば駅')
    expect(lines().slice(4)).toEqual(['交通費\u3000（往復）500円', '\u3000\u3000園田駅〜なんば駅'])
  })

  it('金額や駅が空なら登録しない', () => {
    mount()
    addPattern('', '園田', 'なんば')
    expect($('.form-error').textContent).toBe('金額を 0 以上の数で入れてください')
    addPattern('500', '園田', '')
    expect($('.form-error').textContent).toBe('駅を2つとも入れてください')
    expect(document.querySelectorAll('input[name="transport"]')).toHaveLength(1) // 「交通費なし」だけ
  })

  it('コピーすると報告文がクリップボードに入り、次の日は受領済みと前回の勤務時間が入っている', async () => {
    const { storage } = mount()
    addPattern('500', '園田', 'なんば')
    setValue(byLabel<HTMLSelectElement>('開始の時'), '17', 'change')
    await copy()
    expect(clipboard).toBe(report())
    expect($('#after-copy').textContent).toContain('次の報告では「10月14日分受領済み」が入ります')

    clock = new Date('2026-10-15T23:05:00+09:00')
    mount(storage)
    expect(lines()).toEqual([
      '勤務時間報告',
      '10月15日(木曜日)',
      '勤務時間\u300017:00 〜23:00',
      '休憩時間\u30000分',
      '交通費\u3000（往復）500円',
      '\u3000\u3000園田駅〜なんば駅',
      '10月14日分受領済み',
    ])
    expect($<HTMLInputElement>('#received-date').value).toBe('2026-10-14')
  })

  it('コピーの完了を待たずに、押した時点で勤務日と勤務時間を記録する', () => {
    // 権限の確認などで、クリップボードへの書き込みがいつまでも終わらない場合
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise(() => {}) },
    })
    const { storage } = mount()
    button('コピーして報告する').click()

    clock = new Date('2026-10-15T23:05:00+09:00')
    mount(storage)
    expect(lines().at(-1)).toBe('10月14日分受領済み')
  })

  it('月払いにすると受領済みの行が消え、開き直しても月払いのまま', async () => {
    const { storage } = mount()
    await copy()
    clock = new Date('2026-10-15T23:05:00+09:00')
    mount(storage)
    expect(report()).toContain('10月14日分受領済み')

    const monthly = $<HTMLInputElement>('input[name="pay-mode"][value="monthly"]')
    monthly.checked = true
    monthly.dispatchEvent(new Event('change'))
    expect(report()).not.toContain('受領済み')
    expect($('.received').hidden).toBe(true)

    mount(storage)
    expect(report()).not.toContain('受領済み')
  })

  it('受領済みの勤務日は変えられ、「消す」で行を書かない', async () => {
    const { storage } = mount()
    await copy()
    clock = new Date('2026-10-15T23:05:00+09:00')
    mount(storage)

    setValue($<HTMLInputElement>('#received-date'), '2026-10-12', 'change')
    expect(lines().at(-1)).toBe('10月12日分受領済み')
    button('消す').click()
    expect(report()).not.toContain('受領済み')
  })

  it('遅れて報告するときは日付を戻せ、受領済みもその前の報告に合わせる', async () => {
    const { storage } = mount()
    await copy() // 10/14 を報告
    clock = new Date('2026-10-16T12:00:00+09:00')
    mount(storage)
    expect($('#work-date-text').textContent).toBe('10月16日(金曜日)')

    button('‹ 前の日').click()
    expect($('#work-date-text').textContent).toBe('10月15日(木曜日)')
    expect(lines().at(-1)).toBe('10月14日分受領済み')

    button('‹ 前の日').click() // 10/14 自身を報告し直す
    expect(report()).not.toContain('受領済み')
    button('今日').click()
    expect($<HTMLInputElement>('#work-date').value).toBe('2026-10-16')
  })

  it('休憩はボタンで選べ、実働を出す', () => {
    mount()
    button('30分').click()
    expect(button('30分').getAttribute('aria-pressed')).toBe('true')
    expect(report()).toContain('休憩時間\u300030分')
    expect($('#working').textContent).toBe('実働 6時間30分')

    setValue(byLabel<HTMLInputElement>('休憩（分）'), '20')
    expect(report()).toContain('休憩時間\u300020分')
  })

  it('交通費のパターンはタップで切り替えられ、開き直しても選んだまま', () => {
    const { storage } = mount()
    addPattern('500', '園田', 'なんば')
    addPattern('1200', '園田', '梅田')
    expect(report()).toContain('（往復）1,200円')

    const first = $<HTMLInputElement>('input[name="transport"][value="p1"]')
    first.checked = true
    first.dispatchEvent(new Event('change'))
    expect(report()).toContain('（往復）500円')

    mount(storage)
    expect(report()).toContain('（往復）500円')
    expect(document.querySelectorAll('input[name="transport"]')).toHaveLength(3)
  })

  it('パターンは編集・削除できる', () => {
    mount()
    addPattern('500', '園田', 'なんば')
    button('500円 園田駅〜なんば駅 を編集').click()
    setValue(byLabel<HTMLInputElement>('交通費（往復）の金額'), '560')
    $<HTMLFormElement>('.pattern-editor').requestSubmit()
    expect(report()).toContain('（往復）560円')

    button('560円 園田駅〜なんば駅 を編集').click()
    button('このパターンを消す').click()
    button('もう一度押すと消す').click()
    expect(report()).toContain('交通費\u3000なし')
  })

  it('同じ日に開き直すと、書きかけの入力が残っている', () => {
    const { storage } = mount()
    setValue(byLabel<HTMLSelectElement>('終了の時'), '22', 'change')
    button('15分').click()
    clock = new Date('2026-10-14T23:30:00+09:00')
    mount(storage)
    expect(report()).toContain('勤務時間\u300016:00 〜22:00')
    expect(report()).toContain('休憩時間\u300015分')
  })

  it('保存できない端末では、消えることを知らせる', () => {
    mount(null)
    const alerts = [...document.querySelectorAll<HTMLElement>('[role="alert"]')].filter((el) => !el.hidden)
    expect(alerts.map((el) => el.textContent)).toEqual([expect.stringContaining('この端末では数字を保存できません')])
  })
})
