const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 報告時刻の初期値。いまに一番近い「ちょうど」の時刻を 'HH:00' で返す
 * （29分までは切り捨て、30分からは切り上げ。23:30 は 00:00）
 */
export function nearestHour(now: Date): string {
  const hour = (now.getHours() + (now.getMinutes() >= 30 ? 1 : 0)) % 24
  return `${pad(hour)}:00`
}

/**
 * 営業日（'YYYY-MM-DD'、端末の時刻で）。dayStartHour より前の深夜は前日の営業日にする
 */
export function businessDate(date: Date, dayStartHour: number): string {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() - dayStartHour)
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`
}

/**
 * startedAt（ISO 8601）が now より前の営業日なら、その時刻を返す。同じ営業日・記録なしなら null。
 * 前の営業日の数字が残っているかの判定に使う
 */
export function earlierBusinessDay(startedAt: string | null, dayStartHour: number, now: Date): Date | null {
  if (!startedAt) return null
  const started = new Date(startedAt)
  return businessDate(started, dayStartHour) === businessDate(now, dayStartHour) ? null : started
}

/** 「10/14 21:03」の形（端末の時刻で） */
export function formatMonthDayTime(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 「21:03」の形（端末の時刻で） */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
