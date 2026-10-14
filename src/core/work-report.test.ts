import { describe, expect, it } from 'vitest'
import {
  addPattern,
  buildWorkReport,
  changeWorkDate,
  defaultReceivedDate,
  formatClock,
  formatWorkDate,
  HISTORY_LIMIT,
  initialWorkState,
  isDate,
  lastRecord,
  normalizeStation,
  openingDraft,
  parseWorkState,
  recordReport,
  removePattern,
  saveDraft,
  selectedPattern,
  shiftDate,
  workingMinutes,
  type ReportInput,
  type ReportRecord,
  type WorkReportConfig,
  type WorkReportState,
} from './work-report'

const config: WorkReportConfig = {
  id: 'test-kinmu',
  title: '勤務時間報告',
  dayStartHour: 4,
  defaultShift: { start: '16:00', end: '23:00', breakMinutes: 0 },
}

const sonoda = { id: 'p1', amount: 500, from: '園田', to: 'なんば' }
const umeda = { id: 'p2', amount: 1200, from: '園田', to: '梅田' }
const now = new Date('2026-10-14T23:10:00+09:00')

function record(workDate: string, copiedAt: string, shift = { start: '16:00', end: '23:00', breakMinutes: 0 }): ReportRecord {
  return { ...shift, workDate, copiedAt }
}

const sample: ReportInput = {
  workDate: '2026-10-14',
  start: '16:00',
  end: '23:00',
  breakMinutes: 0,
  transport: sonoda,
  payMode: 'daily',
  receivedDate: '2026-10-13',
}

describe('buildWorkReport', () => {
  it('いただいた例と1文字単位で同じ文面になる', () => {
    expect(buildWorkReport(sample)).toBe(
      [
        '勤務時間報告',
        '10月14日(水曜日)',
        '勤務時間\u300016:00 〜23:00',
        '休憩時間\u30000分',
        '交通費\u3000（往復）500円',
        '\u3000\u3000園田駅〜なんば駅',
        '10月13日分受領済み',
      ].join('\n'),
    )
  })

  it('月払いなら、受領済みの行を書かない', () => {
    const text = buildWorkReport({ ...sample, payMode: 'monthly' })
    expect(text).not.toContain('受領済み')
    expect(text.split('\n')).toHaveLength(6)
  })

  it('受領済みの日付がなければ（初めての報告など）、その行を書かない', () => {
    expect(buildWorkReport({ ...sample, receivedDate: null })).not.toContain('受領済み')
  })

  it('交通費がなければ「交通費\u3000なし」の1行にする', () => {
    const lines = buildWorkReport({ ...sample, transport: null }).split('\n')
    expect(lines[4]).toBe('交通費\u3000なし')
    expect(lines[5]).toBe('10月13日分受領済み')
  })

  it('金額は3桁区切り、時は0埋めしない、休憩は分で書く', () => {
    const text = buildWorkReport({ ...sample, start: '09:30', end: '18:00', breakMinutes: 60, transport: umeda })
    expect(text).toContain('勤務時間\u30009:30 〜18:00')
    expect(text).toContain('休憩時間\u300060分')
    expect(text).toContain('（往復）1,200円')
  })
})

describe('日付と時刻', () => {
  it('formatWorkDate は「10月14日(水曜日)」', () => {
    expect(formatWorkDate('2026-10-14')).toBe('10月14日(水曜日)')
    expect(formatWorkDate('2026-11-01')).toBe('11月1日(日曜日)')
  })

  it('formatClock は時を0埋めしない', () => {
    expect(formatClock('09:05')).toBe('9:05')
    expect(formatClock('23:00')).toBe('23:00')
  })

  it('shiftDate は月・年をまたぐ', () => {
    expect(shiftDate('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('isDate は実在する日付だけを通す', () => {
    expect(isDate('2026-10-14')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('20261014')).toBe(false)
  })

  it('workingMinutes は休憩を引き、日をまたぐ勤務も数える', () => {
    expect(workingMinutes({ start: '16:00', end: '23:00', breakMinutes: 30 })).toBe(390)
    expect(workingMinutes({ start: '20:00', end: '02:00', breakMinutes: 0 })).toBe(360)
    expect(workingMinutes({ start: '16:00', end: '17:00', breakMinutes: 60 })).toBeNull()
  })
})

describe('交通費のパターン', () => {
  it('駅名は前後の空白と末尾の「駅」を取る', () => {
    expect(normalizeStation(' 園田駅 ')).toBe('園田')
    expect(normalizeStation('なんば')).toBe('なんば')
  })

  it('足したパターンが選ばれる', () => {
    const state = addPattern(addPattern(initialWorkState(), sonoda, now), umeda, now)
    expect(selectedPattern(state)).toEqual(umeda)
  })

  it('選んでいたパターンを消すと残りの先頭、全部消すと「なし」になる', () => {
    let state = addPattern(addPattern(initialWorkState(), sonoda, now), umeda, now)
    state = removePattern(state, 'p2', now)
    expect(state.selectedPatternId).toBe('p1')
    state = removePattern(state, 'p1', now)
    expect(state.selectedPatternId).toBeNull()
  })
})

describe('受領済みの日付', () => {
  const history = [record('2026-10-10', '2026-10-10T14:00:00Z'), record('2026-10-13', '2026-10-13T14:00:00Z')]

  it('勤務日より前で、いちばん新しい報告の勤務日', () => {
    expect(defaultReceivedDate(history, '2026-10-14')).toBe('2026-10-13')
  })

  it('同じ日の報告をコピーし直しても、その日自身にはならない', () => {
    const again = [...history, record('2026-10-14', '2026-10-14T14:00:00Z')]
    expect(defaultReceivedDate(again, '2026-10-14')).toBe('2026-10-13')
  })

  it('遅れて前の日の分を報告するときは、それより前の報告', () => {
    expect(defaultReceivedDate(history, '2026-10-12')).toBe('2026-10-10')
  })

  it('報告が1つもなければ null（行を書かない）', () => {
    expect(defaultReceivedDate([], '2026-10-14')).toBeNull()
  })

  it('勤務日を変えると決め直すが、手で変えていたらそのまま', () => {
    const draft = { ...openingDraft(config, { ...initialWorkState(), history }, now) }
    expect(changeWorkDate(draft, history, '2026-10-12').receivedDate).toBe('2026-10-10')
    const edited = { ...draft, receivedDate: '2026-10-01', receivedEdited: true }
    expect(changeWorkDate(edited, history, '2026-10-12').receivedDate).toBe('2026-10-01')
  })
})

describe('recordReport', () => {
  it('勤務日ごとに1件にし、勤務日の順に並べる', () => {
    let state = initialWorkState()
    state = recordReport(state, record('2026-10-14', '2026-10-14T14:00:00Z'))
    state = recordReport(state, record('2026-10-13', '2026-10-14T15:00:00Z'))
    state = recordReport(state, record('2026-10-14', '2026-10-14T16:00:00Z', { start: '17:00', end: '23:00', breakMinutes: 0 }))
    expect(state.history.map((r) => [r.workDate, r.start])).toEqual([
      ['2026-10-13', '16:00'],
      ['2026-10-14', '17:00'],
    ])
    expect(lastRecord(state.history)?.copiedAt).toBe('2026-10-14T16:00:00Z')
  })

  it(`古いものから捨てて ${HISTORY_LIMIT} 件までにする`, () => {
    let state = initialWorkState()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      state = recordReport(state, record(shiftDate('2026-01-01', i), `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`))
    }
    expect(state.history).toHaveLength(HISTORY_LIMIT)
    expect(state.history[0]!.workDate).toBe(shiftDate('2026-01-01', 5))
  })
})

describe('openingDraft（開いたときの初期値）', () => {
  it('初めてなら、今日・設定の勤務時間・受領済みなし', () => {
    expect(openingDraft(config, initialWorkState(), now)).toEqual({
      workDate: '2026-10-14',
      start: '16:00',
      end: '23:00',
      breakMinutes: 0,
      receivedDate: null,
      receivedEdited: false,
      savedAt: now.toISOString(),
    })
  })

  it('次の日に開くと、勤務時間は前回と同じで、受領済みは前回の勤務日', () => {
    const state = recordReport(
      initialWorkState(),
      record('2026-10-14', '2026-10-14T14:10:00Z', { start: '17:00', end: '22:30', breakMinutes: 15 }),
    )
    const next = openingDraft(config, state, new Date('2026-10-15T22:50:00+09:00'))
    expect(next).toMatchObject({ workDate: '2026-10-15', start: '17:00', end: '22:30', breakMinutes: 15, receivedDate: '2026-10-14' })
  })

  it('深夜 4 時より前に開くと、勤務日は前日', () => {
    expect(openingDraft(config, initialWorkState(), new Date('2026-10-15T01:30:00+09:00')).workDate).toBe('2026-10-14')
  })

  it('同じ営業日の書きかけがあればそれを戻し、次の日なら使わない', () => {
    const draft = { ...openingDraft(config, initialWorkState(), now), start: '18:00' }
    const state = saveDraft(initialWorkState(), draft)
    expect(openingDraft(config, state, new Date('2026-10-14T23:40:00+09:00')).start).toBe('18:00')
    expect(openingDraft(config, state, new Date('2026-10-15T16:00:00+09:00')).start).toBe('16:00')
  })
})

describe('parseWorkState（保存されていた値を戻す）', () => {
  it('正しい値はそのまま戻る', () => {
    let state: WorkReportState = addPattern(addPattern(initialWorkState(), sonoda, now), umeda, now)
    state = recordReport(state, record('2026-10-13', '2026-10-13T14:00:00.000Z'))
    state = saveDraft(state, openingDraft(config, state, now))
    state = { ...state, payMode: 'monthly' }
    expect(parseWorkState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it.each([null, 'text', 1, []])('壊れた値 %j は空の状態になる', (raw) => {
    expect(parseWorkState(raw)).toEqual(initialWorkState())
  })

  it('壊れた項目だけ捨てる', () => {
    const state = parseWorkState({
      patterns: [sonoda, { id: 'bad', amount: -1, from: 'a', to: 'b' }, { id: 'p1', amount: 1, from: 'x', to: 'y' }],
      selectedPatternId: 'missing',
      payMode: 'weekly',
      history: [record('2026-10-13', '2026-10-13T14:00:00Z'), { workDate: '2026-02-30', start: '16:00' }],
      draft: { workDate: '2026-10-14', start: '25:00', end: '23:00', breakMinutes: 0, savedAt: '2026-10-14T00:00:00Z' },
    })
    expect(state.patterns).toEqual([sonoda])
    expect(state.selectedPatternId).toBeNull()
    expect(state.payMode).toBe('daily')
    expect(state.history.map((r) => r.workDate)).toEqual(['2026-10-13'])
    expect(state.draft).toBeNull()
  })
})
