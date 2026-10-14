import type { WorkReportConfig } from '../../core/work-report'

/**
 * 勤務時間報告。勤務日・勤務時間・休憩・交通費から報告文を作ってコピーする。
 * 交通費のパターンと、前回の勤務日・勤務時間は端末に保存する。id は保存のキーなので変えない
 */
export const kinmu: WorkReportConfig = {
  id: 'kinmu',
  title: '勤務時間報告',
  dayStartHour: 4,
  defaultShift: { start: '16:00', end: '23:00', breakMinutes: 0 },
}
