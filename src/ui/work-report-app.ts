import './work-report.css'
import { formatNumber } from '../core/format'
import type { SaveResult } from '../core/json-store'
import { openLocalStorage, type KeyValueStorage } from '../core/storage'
import { businessDate } from '../core/time'
import {
  addPattern,
  buildWorkReport,
  changeWorkDate,
  formatMonthDay,
  formatWorkDate,
  isDate,
  normalizeStation,
  openingDraft,
  recordReport,
  removePattern,
  saveDraft,
  selectedPattern,
  selectPattern,
  setPayMode,
  shiftDate,
  updatePattern,
  workingMinutes,
  type PayMode,
  type ReportDraft,
  type TransportPattern,
  type WorkReportConfig,
  type WorkReportState,
} from '../core/work-report'
import { WorkReportStore } from '../core/work-report-store'
import { copyText, selectContents } from './clipboard'
import { confirmButton } from './confirm-button'
import { h } from './dom'
import { keepFresh, pageHeader, pageStatus } from './page-parts'

export type MountOptions = {
  /** 保存先。省略すると端末の localStorage（使えなければ保存しない） */
  storage?: KeyValueStorage | null
  /** いまの時刻。テストで差し替える */
  now?: () => Date
  /** 交通費のパターンの id を作る。テストで差し替える */
  newId?: () => string
}

export type WorkReportApp = {
  store: WorkReportStore
  /** タイマーとイベントを外す（テスト用） */
  unmount: () => void
}

/** 休憩のよく使う長さ（分） */
const BREAK_PRESETS = [0, 15, 30, 45, 60, 90]

const pad = (n: number) => String(n).padStart(2, '0')

function defaultNewId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 時（0〜23）と分（5分刻み）の2つのセレクト。iPhone では回転式で選べる */
function timePicker(label: string) {
  const hour = h(
    'select',
    { 'aria-label': `${label}の時` },
    Array.from({ length: 24 }, (_, i) => h('option', { value: pad(i), text: String(i) })),
  )
  const minute = h(
    'select',
    { 'aria-label': `${label}の分` },
    Array.from({ length: 12 }, (_, i) => h('option', { value: pad(i * 5), text: pad(i * 5) })),
  )
  const element = h('div', { class: 'time-picker' }, [
    h('span', { class: 'time-label', text: label }),
    hour,
    h('span', { class: 'colon', text: ':' }),
    minute,
  ])
  return {
    element,
    hour,
    minute,
    get value() {
      return `${hour.value}:${minute.value}`
    },
    set value(time: string) {
      const [hh = '00', mm = '00'] = time.split(':')
      hour.value = hh
      // 5分刻みにない分（保存値を手で書き換えたときなど）も、選べるように足す
      if (![...minute.options].some((o) => o.value === mm)) minute.append(h('option', { value: mm, text: mm }))
      minute.value = mm
    },
  }
}

/**
 * 勤務時間報告のページを root の中に組み立てる。
 * 書きかけ（draft）は入力のたびに保存し、コピーしたときに勤務日と勤務時間を記録する（docs/architecture.md）
 */
export function mountWorkReportApp(
  root: HTMLElement,
  config: WorkReportConfig,
  options: MountOptions = {},
): WorkReportApp {
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? defaultNewId
  const store = new WorkReportStore(config, options.storage === undefined ? openLocalStorage() : options.storage)
  let lastSave: SaveResult | null = null
  let draft: ReportDraft = openingDraft(config, store.current, now())

  const status = pageStatus({
    dayStartHour: config.dayStartHour,
    idleText: '交通費と、コピーした勤務日・勤務時間はこの端末に保存されます',
  })

  // ---- 勤務日 ----
  const workDate = h('input', { type: 'date', id: 'work-date', 'aria-label': '勤務日' })
  const workDateText = h('p', { class: 'hint', id: 'work-date-text' })
  const prevDay = h('button', { type: 'button', class: 'ghost', text: '‹ 前の日' })
  const today = h('button', { type: 'button', class: 'ghost', text: '今日' })
  const nextDay = h('button', { type: 'button', class: 'ghost', text: '次の日 ›' })

  workDate.addEventListener('change', () => {
    if (isDate(workDate.value)) editDraft(changeWorkDate(draft, store.current.history, workDate.value))
    else workDate.value = draft.workDate
  })
  prevDay.addEventListener('click', () => editDraft(changeWorkDate(draft, store.current.history, shiftDate(draft.workDate, -1))))
  nextDay.addEventListener('click', () => editDraft(changeWorkDate(draft, store.current.history, shiftDate(draft.workDate, 1))))
  today.addEventListener('click', () =>
    editDraft(changeWorkDate(draft, store.current.history, businessDate(now(), config.dayStartHour))),
  )

  // ---- 勤務時間・休憩 ----
  const start = timePicker('開始')
  const end = timePicker('終了')
  for (const picker of [start, end]) {
    for (const select of [picker.hour, picker.minute]) {
      select.addEventListener('change', () => editDraft({ ...draft, start: start.value, end: end.value }))
    }
  }

  const breakChips = BREAK_PRESETS.map((minutes) => {
    const chip = h('button', { type: 'button', class: 'chip', text: `${minutes}分` })
    chip.addEventListener('click', () => editDraft({ ...draft, breakMinutes: minutes }))
    return { minutes, chip }
  })
  const breakInput = h('input', {
    type: 'number',
    id: 'break-minutes',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    min: 0,
    step: 5,
    'aria-label': '休憩（分）',
  })
  breakInput.addEventListener('input', () => {
    const n = Number(breakInput.value)
    if (breakInput.value.trim() === '' || !Number.isInteger(n) || n < 0) return
    editDraft({ ...draft, breakMinutes: n })
  })
  breakInput.addEventListener('blur', () => {
    breakInput.value = String(draft.breakMinutes)
  })
  const working = h('p', { class: 'hint', id: 'working' })

  // ---- 交通費 ----
  const patternList = h('div', { class: 'patterns', role: 'radiogroup', 'aria-label': '交通費' })
  const addButton = h('button', { type: 'button', class: 'ghost', text: '＋ パターンを追加' })

  const amountInput = h('input', {
    type: 'number',
    id: 'pattern-amount',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    min: 0,
    step: 10,
    'aria-label': '交通費（往復）の金額',
  })
  const fromInput = h('input', { type: 'text', id: 'pattern-from', 'aria-label': '駅（行き）', placeholder: '園田' })
  const toInput = h('input', { type: 'text', id: 'pattern-to', 'aria-label': '駅（帰り）', placeholder: 'なんば' })
  const editorError = h('p', { class: 'form-error', role: 'alert', hidden: true })
  const editorTitle = h('h3')
  const saveButton = h('button', { type: 'submit', class: 'solid', text: '保存' })
  const cancelButton = h('button', { type: 'button', class: 'ghost', text: 'やめる' })
  const deleteButton = h('button', { type: 'button', class: 'ghost' })
  const editor = h('form', { class: 'pattern-editor', hidden: true, novalidate: true }, [
    editorTitle,
    h('label', { class: 'amount-field' }, [h('span', { text: '金額（往復）' }), amountInput, h('span', { text: '円' })]),
    h('div', { class: 'route-field' }, [fromInput, h('span', { text: '駅 〜' }), toInput, h('span', { text: '駅' })]),
    editorError,
    h('div', { class: 'editor-actions' }, [saveButton, cancelButton, deleteButton]),
  ])
  /** 編集中のパターンの id。新しく足すときは null */
  let editingId: string | null = null
  /** 初めて使うときに、登録の欄を自動で開いたか（閉じたら開き直さない） */
  let autoOpened = false

  function openEditor(pattern: TransportPattern | null, { focus = true } = {}) {
    editingId = pattern?.id ?? null
    editorTitle.textContent = pattern ? 'パターンを編集' : '交通費のパターンを追加'
    amountInput.value = pattern ? String(pattern.amount) : ''
    fromInput.value = pattern?.from ?? ''
    toInput.value = pattern?.to ?? ''
    editorError.hidden = true
    deleteButton.hidden = pattern === null
    editor.hidden = false
    addButton.hidden = true
    if (focus) amountInput.focus()
  }
  function closeEditor() {
    editor.hidden = true
    addButton.hidden = false
    editingId = null
  }

  editor.addEventListener('submit', (e) => {
    e.preventDefault()
    const amount = Number(amountInput.value)
    const from = normalizeStation(fromInput.value)
    const to = normalizeStation(toInput.value)
    if (amountInput.value.trim() === '' || !Number.isInteger(amount) || amount < 0) {
      editorError.textContent = '金額を 0 以上の数で入れてください'
    } else if (!from || !to) {
      editorError.textContent = '駅を2つとも入れてください'
    } else {
      const at = now()
      change(
        editingId
          ? updatePattern(store.current, { id: editingId, amount, from, to }, at)
          : addPattern(store.current, { id: newId(), amount, from, to }, at),
      )
      closeEditor()
      return
    }
    editorError.hidden = false
  })
  cancelButton.addEventListener('click', closeEditor)
  addButton.addEventListener('click', () => openEditor(null))
  confirmButton(deleteButton, {
    label: 'このパターンを消す',
    armedLabel: 'もう一度押すと消す',
    onConfirm: () => {
      if (editingId) change(removePattern(store.current, editingId, now()))
      closeEditor()
    },
  })

  /** 一覧を最後に組み立てたときのパターンと選択。変わったときだけ組み立て直す（操作中のフォーカスを奪わないように） */
  let renderedPatterns = ''

  function renderPatterns(state: WorkReportState) {
    const signature = JSON.stringify([state.patterns, state.selectedPatternId])
    if (signature === renderedPatterns) return
    renderedPatterns = signature

    const choice = (id: string | null, children: Node[]) => {
      const radio = h('input', { type: 'radio', name: 'transport', value: id ?? '' })
      radio.checked = state.selectedPatternId === id
      radio.addEventListener('change', () => change(selectPattern(store.current, id, now())))
      return h('label', { class: 'pattern' }, [radio, ...children])
    }
    patternList.replaceChildren(
      ...state.patterns.map((p) => {
        const edit = h('button', {
          type: 'button',
          class: 'ghost small',
          text: '編集',
          'aria-label': `${formatNumber(p.amount)}円 ${p.from}駅〜${p.to}駅 を編集`,
        })
        edit.addEventListener('click', () => openEditor(p))
        return h('div', { class: 'pattern-row' }, [
          choice(p.id, [
            h('span', { class: 'pattern-amount', text: `${formatNumber(p.amount)}円` }),
            h('span', { class: 'pattern-route', text: `${p.from}駅〜${p.to}駅` }),
          ]),
          edit,
        ])
      }),
      h('div', { class: 'pattern-row' }, [choice(null, [h('span', { class: 'pattern-route', text: '交通費なし' })])]),
    )
  }

  // ---- 給料の受け取り ----
  const payRadios = (['daily', 'monthly'] as PayMode[]).map((mode) => {
    const radio = h('input', { type: 'radio', name: 'pay-mode', value: mode })
    radio.addEventListener('change', () => change(setPayMode(store.current, mode, now())))
    return { mode, radio, label: h('label', {}, [radio, h('span', { text: mode === 'daily' ? '日払い' : '月払い' })]) }
  })
  const receivedDate = h('input', { type: 'date', id: 'received-date' })
  const clearReceived = h('button', { type: 'button', class: 'ghost', text: '消す' })
  const receivedHint = h('p', { class: 'hint', id: 'received-hint' })
  const receivedBlock = h('div', { class: 'received' }, [
    h('label', { for: receivedDate.id, text: '受領済みの勤務日（前回の勤務日）' }),
    h('div', { class: 'date-row' }, [receivedDate, clearReceived]),
    receivedHint,
  ])
  const monthlyHint = h('p', { class: 'hint', text: '月払いのときは、受領済みの行を書きません。' })
  receivedDate.addEventListener('change', () => {
    editDraft({ ...draft, receivedDate: isDate(receivedDate.value) ? receivedDate.value : null, receivedEdited: true })
  })
  clearReceived.addEventListener('click', () => editDraft({ ...draft, receivedDate: null, receivedEdited: true }))

  // ---- 報告文 ----
  const report = h('pre', { class: 'report', id: 'report' })
  const copyButton = h('button', { type: 'button', class: 'solid copy-main', text: 'コピーして報告する' })
  const afterCopy = h('p', { class: 'hint', id: 'after-copy', role: 'status' })
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  copyButton.addEventListener('click', async () => {
    const text = report.textContent ?? ''
    // 押した時点で記録する。コピーの完了（権限の確認などで待つことがある）を待つと、
    // その間にページを離れたとき記録されないため。長押しでコピーしてもらう場合も、報告するつもりで押しているので記録する
    // （ここまでは同期で動くので、コピーはボタン操作の中のまま呼べる）
    change(
      recordReport(store.current, {
        workDate: draft.workDate,
        start: draft.start,
        end: draft.end,
        breakMinutes: draft.breakMinutes,
        copiedAt: now().toISOString(),
      }),
    )
    const copied = await copyText(text)
    if (!copied) selectContents(report)
    clearTimeout(copyTimer)
    copyButton.textContent = copied ? 'コピーしました' : '選択したので長押しでコピー'
    copyTimer = setTimeout(() => (copyButton.textContent = 'コピーして報告する'), copied ? 1600 : 2600)
    afterCopy.textContent =
      store.current.payMode === 'daily'
        ? `勤務日と勤務時間を保存しました。次の報告では「${formatMonthDay(draft.workDate)}分受領済み」が入ります。`
        : '勤務日と勤務時間を保存しました。'
  })

  root.replaceChildren(
    pageHeader(config.title, [
      h('p', { class: 'lead', text: '入れた内容から報告文を作ります。前回の勤務時間と交通費は最初から入っています。' }),
      status.saveStatus,
    ]),
    status.storageWarning,
    h('section', { class: 'card', 'data-part': 'date' }, [
      h('h2', { text: '勤務日' }),
      h('div', { class: 'date-row' }, [workDate]),
      h('div', { class: 'day-buttons' }, [prevDay, today, nextDay]),
      workDateText,
    ]),
    h('section', { class: 'card', 'data-part': 'shift' }, [
      h('h2', { text: '勤務時間' }),
      h('div', { class: 'time-row' }, [start.element, h('span', { class: 'wave', text: '〜' }), end.element]),
      h('div', { class: 'break-row' }, [
        h('span', { class: 'time-label', text: '休憩' }),
        h('div', { class: 'chips' }, breakChips.map((c) => c.chip)),
        h('label', { class: 'break-custom' }, [breakInput, h('span', { text: '分' })]),
      ]),
      working,
    ]),
    h('section', { class: 'card', 'data-part': 'transport' }, [
      h('h2', { text: '交通費（往復）' }),
      patternList,
      addButton,
      editor,
    ]),
    h('section', { class: 'card', 'data-part': 'pay' }, [
      h('h2', { text: '給料の受け取り' }),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': '給料の受け取り' },
        payRadios.map((p) => p.label),
      ),
      receivedBlock,
      monthlyHint,
    ]),
    h('section', { class: 'card', 'data-part': 'report' }, [
      h('h2', { text: '報告文' }),
      report,
      copyButton,
      afterCopy,
    ]),
  )

  // ---- 状態の変更と描画 ----
  function change(next: WorkReportState) {
    lastSave = store.update(next)
    render()
  }

  /** 書きかけを変えて保存する */
  function editDraft(next: ReportDraft) {
    draft = { ...next, savedAt: now().toISOString() }
    change(saveDraft(store.current, draft))
  }

  function render() {
    const state = store.current
    const at = now()

    if (document.activeElement !== workDate) workDate.value = draft.workDate
    workDateText.textContent = formatWorkDate(draft.workDate)

    start.value = draft.start
    end.value = draft.end
    for (const { minutes, chip } of breakChips) chip.setAttribute('aria-pressed', String(draft.breakMinutes === minutes))
    if (document.activeElement !== breakInput) breakInput.value = String(draft.breakMinutes)
    const minutes = workingMinutes(draft)
    working.textContent =
      minutes === null
        ? '休憩が勤務時間より長くなっています'
        : `実働 ${Math.floor(minutes / 60)}時間${minutes % 60}分${draft.end <= draft.start ? '（日をまたぐ勤務）' : ''}`
    working.classList.toggle('warn', minutes === null)

    renderPatterns(state)
    if (state.patterns.length === 0 && !autoOpened) {
      // 初めて使うときは、最初のパターンを入れる欄を開いておく（フォーカスは奪わない）
      autoOpened = true
      openEditor(null, { focus: false })
    }

    for (const { mode, radio } of payRadios) radio.checked = state.payMode === mode
    const daily = state.payMode === 'daily'
    receivedBlock.hidden = !daily
    monthlyHint.hidden = daily
    if (document.activeElement !== receivedDate) receivedDate.value = draft.receivedDate ?? ''
    clearReceived.disabled = draft.receivedDate === null
    receivedHint.textContent = draft.receivedDate
      ? `「${formatMonthDay(draft.receivedDate)}分受領済み」と書きます。`
      : '空なので、受領済みの行は書きません。'

    const text = buildWorkReport({
      ...draft,
      transport: selectedPattern(state),
      payMode: state.payMode,
    })
    // 変わったときだけ書き換える（長押しコピー用に選択した範囲が、定期の描き直しで消えないように）
    if (report.textContent !== text) report.textContent = text

    status.update({ available: store.available, lastSave, updatedAt: state.updatedAt, now: at })
  }

  // 開きっぱなしで営業日が変わったら、次の報告の初期値に入れ替える。別のタブの変更も拾う
  const refresh = () => {
    draft = openingDraft(config, { ...store.current, draft }, now())
    render()
  }
  const stopFresh = keepFresh(store, {
    onTick: refresh,
    onReload: () => {
      draft = openingDraft(config, store.current, now())
      render()
    },
  })
  render()

  return {
    store,
    unmount: () => {
      stopFresh()
      clearTimeout(copyTimer)
    },
  }
}
