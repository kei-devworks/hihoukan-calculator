/**
 * 勤務時間報告の文面と、端末に残す記録（DOM に触れない）。
 *
 * ```
 * 勤務時間報告
 * 10月14日(水曜日)
 * 勤務時間　16:00 〜23:00
 * 休憩時間　0分
 * 交通費　（往復）500円
 * 　　園田駅〜なんば駅
 * 10月13日分受領済み
 * ```
 *
 * 最後の行（受領済み）は日払いのときだけ書く。日払いは「次の勤務日に前回分を受け取る」ので、
 * 前回の勤務日を入れる（docs/architecture.md）
 */

import { formatNumber } from './format'
import { isCount, isDateString, isRecord } from './guards'
import { businessDate } from './time'

/** 全角スペース（文面の区切り。ソースに直接書くと見分けにくいので定数にする） */
const ZS = '\u3000'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

export type WorkReportConfig = {
  /** 保存のキーになる。公開したあとは変えない */
  id: string
  title: string
  /** 営業日の切り替わる時刻。この時刻より前の深夜に開くと、勤務日の初期値は前日になる */
  dayStartHour: number
  /** 初めて使うときの勤務時間 */
  defaultShift: Shift
}

/** 勤務時間。時刻は 'HH:MM'（24時間） */
export type Shift = {
  start: string
  end: string
  breakMinutes: number
}

/** 交通費のパターン（往復の金額と2駅） */
export type TransportPattern = {
  id: string
  amount: number
  /** 駅名（「駅」は付けない。文面で付ける） */
  from: string
  to: string
}

export type PayMode = 'daily' | 'monthly'

/** コピーした報告の記録 */
export type ReportRecord = Shift & {
  /** 勤務日 'YYYY-MM-DD' */
  workDate: string
  /** コピーした時刻（ISO 8601） */
  copiedAt: string
}

/** 書きかけの報告。同じ営業日のうちに開き直したら、これを戻す */
export type ReportDraft = Shift & {
  workDate: string
  /** 受領済みにする勤務日。null なら受領済みの行を書かない */
  receivedDate: string | null
  /** 受領済みの日付を手で変えたか。変えていなければ、勤務日を変えたときに決め直す */
  receivedEdited: boolean
  /** 最後に書きかけを保存した時刻（ISO 8601） */
  savedAt: string
}

export type WorkReportState = {
  patterns: TransportPattern[]
  /** 選んでいる交通費のパターン。null なら「交通費なし」 */
  selectedPatternId: string | null
  payMode: PayMode
  /** コピーした報告。勤務日ごとに1件、勤務日の古い順 */
  history: ReportRecord[]
  draft: ReportDraft | null
  /** 最後に何かを保存した時刻（ISO 8601） */
  updatedAt: string | null
}

/** history に残す件数（受領済みの日付を決めるのに要るのは直近だけ） */
export const HISTORY_LIMIT = 60

export function initialWorkState(): WorkReportState {
  return { patterns: [], selectedPatternId: null, payMode: 'daily', history: [], draft: null, updatedAt: null }
}

// ---- 日付・時刻 ----

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_PATTERN.test(v)
}

export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_PATTERN.test(v)) return false
  const [y, m, d] = v.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** 'YYYY-MM-DD' を端末の時刻の 0 時として読む */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** 'YYYY-MM-DD' を days 日ずらす */
export function shiftDate(date: string, days: number): string {
  const d = parseDate(date)
  d.setDate(d.getDate() + days)
  return businessDate(d, 0)
}

/** 「10月14日(水曜日)」 */
export function formatWorkDate(date: string): string {
  const d = parseDate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]}曜日)`
}

/** 「10月13日」 */
export function formatMonthDay(date: string): string {
  const d = parseDate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** '09:00' → '9:00'（時は0埋めしない） */
export function formatClock(time: string): string {
  const [h, m] = time.split(':')
  return `${Number(h)}:${m}`
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/**
 * 実働の分数（終了 − 開始 − 休憩）。終了が開始より前なら日をまたいだものとする。
 * 休憩が勤務時間以上なら null
 */
export function workingMinutes(shift: Shift): number | null {
  let span = minutesOf(shift.end) - minutesOf(shift.start)
  if (span <= 0) span += 24 * 60
  const working = span - shift.breakMinutes
  return working > 0 ? working : null
}

// ---- 交通費 ----

/** 駅名の前後の空白と、末尾の「駅」を取る（文面で「駅」を付けるため） */
export function normalizeStation(name: string): string {
  return name.trim().replace(/駅$/, '').trim()
}

export function selectedPattern(state: WorkReportState): TransportPattern | null {
  return state.patterns.find((p) => p.id === state.selectedPatternId) ?? null
}

/** パターンを足して、それを選ぶ */
export function addPattern(state: WorkReportState, pattern: TransportPattern, now: Date): WorkReportState {
  return { ...state, patterns: [...state.patterns, pattern], selectedPatternId: pattern.id, updatedAt: now.toISOString() }
}

export function updatePattern(state: WorkReportState, pattern: TransportPattern, now: Date): WorkReportState {
  return {
    ...state,
    patterns: state.patterns.map((p) => (p.id === pattern.id ? pattern : p)),
    updatedAt: now.toISOString(),
  }
}

/** パターンを消す。選んでいたものを消したら、残りの先頭（なければ「なし」）を選ぶ */
export function removePattern(state: WorkReportState, id: string, now: Date): WorkReportState {
  const patterns = state.patterns.filter((p) => p.id !== id)
  const selectedPatternId =
    state.selectedPatternId === id ? (patterns[0]?.id ?? null) : state.selectedPatternId
  return { ...state, patterns, selectedPatternId, updatedAt: now.toISOString() }
}

export function selectPattern(state: WorkReportState, id: string | null, now: Date): WorkReportState {
  return { ...state, selectedPatternId: id, updatedAt: now.toISOString() }
}

export function setPayMode(state: WorkReportState, payMode: PayMode, now: Date): WorkReportState {
  return { ...state, payMode, updatedAt: now.toISOString() }
}

// ---- 報告の記録と、次の報告の初期値 ----

/** 最後にコピーした報告 */
export function lastRecord(history: ReportRecord[]): ReportRecord | null {
  return history.reduce<ReportRecord | null>((last, r) => (!last || r.copiedAt > last.copiedAt ? r : last), null)
}

/**
 * 受領済みにする勤務日の初期値: workDate より前で、いちばん新しい報告の勤務日。なければ null（行を書かない）。
 * 同じ日の報告をコピーし直したときや、遅れて前の日の分を報告するときも、正しい「前回」になる
 */
export function defaultReceivedDate(history: ReportRecord[], workDate: string): string | null {
  return history.reduce<string | null>(
    (latest, r) => (r.workDate < workDate && (!latest || r.workDate > latest) ? r.workDate : latest),
    null,
  )
}

/** コピーした報告を記録する。同じ勤務日の記録は差し替える */
export function recordReport(state: WorkReportState, record: ReportRecord): WorkReportState {
  const history = [...state.history.filter((r) => r.workDate !== record.workDate), record]
    .sort((a, b) => (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0))
    .slice(-HISTORY_LIMIT)
  return { ...state, history, updatedAt: record.copiedAt }
}

export function saveDraft(state: WorkReportState, draft: ReportDraft): WorkReportState {
  return { ...state, draft, updatedAt: draft.savedAt }
}

/**
 * ページを開いたときの報告の初期値。
 * - 同じ営業日に書きかけがあれば、それを戻す（再読み込みで入力が消えないように）
 * - なければ、勤務日は今日（営業日）、勤務時間は前回コピーした報告と同じ（初めてなら設定の既定）、
 *   受領済みは前回の勤務日
 */
export function openingDraft(config: WorkReportConfig, state: WorkReportState, now: Date): ReportDraft {
  const today = businessDate(now, config.dayStartHour)
  const draft = state.draft
  if (draft && businessDate(new Date(draft.savedAt), config.dayStartHour) === today) return draft

  const last = lastRecord(state.history)
  const shift: Shift = last
    ? { start: last.start, end: last.end, breakMinutes: last.breakMinutes }
    : { ...config.defaultShift }
  return {
    ...shift,
    workDate: today,
    receivedDate: defaultReceivedDate(state.history, today),
    receivedEdited: false,
    savedAt: now.toISOString(),
  }
}

/** 勤務日を変える。受領済みを手で変えていなければ、新しい勤務日に合わせて決め直す */
export function changeWorkDate(draft: ReportDraft, history: ReportRecord[], workDate: string): ReportDraft {
  return {
    ...draft,
    workDate,
    receivedDate: draft.receivedEdited ? draft.receivedDate : defaultReceivedDate(history, workDate),
  }
}

// ---- 文面 ----

export type ReportInput = Shift & {
  workDate: string
  transport: TransportPattern | null
  payMode: PayMode
  receivedDate: string | null
}

export function buildWorkReport(input: ReportInput): string {
  const lines = [
    '勤務時間報告',
    formatWorkDate(input.workDate),
    `勤務時間${ZS}${formatClock(input.start)} 〜${formatClock(input.end)}`,
    `休憩時間${ZS}${input.breakMinutes}分`,
  ]
  if (input.transport) {
    lines.push(`交通費${ZS}（往復）${formatNumber(input.transport.amount)}円`)
    lines.push(`${ZS}${ZS}${input.transport.from}駅〜${input.transport.to}駅`)
  } else {
    lines.push(`交通費${ZS}なし`)
  }
  if (input.payMode === 'daily' && input.receivedDate) {
    lines.push(`${formatMonthDay(input.receivedDate)}分受領済み`)
  }
  return lines.join('\n')
}

// ---- 保存値の読み戻し ----

function parseShift(raw: Record<string, unknown>): Shift | null {
  if (!isTime(raw.start) || !isTime(raw.end) || !isCount(raw.breakMinutes)) return null
  return { start: raw.start, end: raw.end, breakMinutes: raw.breakMinutes }
}

/**
 * 保存されていた値を WorkReportState に戻す。壊れた値は捨てる（その項目だけ）。
 * 何が来ても例外にはしない（保存が壊れていても画面は開けるように）
 */
export function parseWorkState(raw: unknown): WorkReportState {
  const state = initialWorkState()
  if (!isRecord(raw)) return state

  if (Array.isArray(raw.patterns)) {
    for (const p of raw.patterns) {
      if (!isRecord(p) || typeof p.id !== 'string' || !isCount(p.amount)) continue
      if (typeof p.from !== 'string' || typeof p.to !== 'string') continue
      if (state.patterns.some((q) => q.id === p.id)) continue
      state.patterns.push({ id: p.id, amount: p.amount, from: p.from, to: p.to })
    }
  }
  if (typeof raw.selectedPatternId === 'string' && state.patterns.some((p) => p.id === raw.selectedPatternId)) {
    state.selectedPatternId = raw.selectedPatternId
  }
  if (raw.payMode === 'monthly') state.payMode = 'monthly'

  if (Array.isArray(raw.history)) {
    let history: ReportRecord[] = []
    for (const r of raw.history) {
      if (!isRecord(r) || !isDate(r.workDate) || !isDateString(r.copiedAt)) continue
      const shift = parseShift(r)
      if (!shift) continue
      history = [...history.filter((h) => h.workDate !== r.workDate), { ...shift, workDate: r.workDate, copiedAt: r.copiedAt }]
    }
    state.history = history.sort((a, b) => (a.workDate < b.workDate ? -1 : 1)).slice(-HISTORY_LIMIT)
  }

  if (isRecord(raw.draft)) {
    const d = raw.draft
    const shift = parseShift(d)
    if (shift && isDate(d.workDate) && isDateString(d.savedAt) && (d.receivedDate === null || isDate(d.receivedDate))) {
      state.draft = {
        ...shift,
        workDate: d.workDate,
        receivedDate: d.receivedDate,
        receivedEdited: d.receivedEdited === true,
        savedAt: d.savedAt,
      }
    }
  }

  if (isDateString(raw.updatedAt)) state.updatedAt = raw.updatedAt
  return state
}
