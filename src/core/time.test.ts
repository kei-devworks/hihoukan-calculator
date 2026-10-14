import { describe, expect, it } from 'vitest'
import { businessDate, earlierBusinessDay, formatMonthDayTime, formatTime, nearestHour } from './time'

// テストは端末の時刻（ローカル時刻）で Date を作る。どのタイムゾーンで流しても同じ結果になる
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi)

describe('nearestHour', () => {
  it.each([
    [at(2026, 10, 15, 20, 0), '20:00'],
    [at(2026, 10, 15, 20, 29), '20:00'],
    [at(2026, 10, 15, 20, 30), '21:00'],
    [at(2026, 10, 15, 20, 59), '21:00'],
    [at(2026, 10, 15, 9, 10), '09:00'],
    [at(2026, 10, 15, 23, 30), '00:00'],
  ])('%s → %s', (now, expected) => {
    expect(nearestHour(now)).toBe(expected)
  })
})

describe('businessDate', () => {
  it('切り替わり時刻より前の深夜は前日の営業日', () => {
    expect(businessDate(at(2026, 10, 15, 3, 59), 4)).toBe('2026-10-14')
    expect(businessDate(at(2026, 10, 15, 4, 0), 4)).toBe('2026-10-15')
    expect(businessDate(at(2026, 10, 15, 23, 59), 4)).toBe('2026-10-15')
  })

  it('月・年をまたぐ', () => {
    expect(businessDate(at(2026, 11, 1, 1, 0), 4)).toBe('2026-10-31')
    expect(businessDate(at(2027, 1, 1, 0, 30), 4)).toBe('2026-12-31')
  })

  it('切り替わりが 0 時ならカレンダーどおり', () => {
    expect(businessDate(at(2026, 10, 15, 0, 0), 0)).toBe('2026-10-15')
  })
})

describe('earlierBusinessDay', () => {
  const iso = (d: Date) => d.toISOString()

  it('前の営業日に始めていれば、その時刻を返す', () => {
    const started = at(2026, 10, 14, 18, 0)
    expect(earlierBusinessDay(iso(started), 4, at(2026, 10, 15, 10, 0))).toEqual(started)
  })

  it('同じ営業日（深夜 3:59 まで）なら null', () => {
    expect(earlierBusinessDay(iso(at(2026, 10, 14, 18, 0)), 4, at(2026, 10, 15, 3, 59))).toBeNull()
  })

  it('記録がなければ null', () => {
    expect(earlierBusinessDay(null, 4, at(2026, 10, 15, 10, 0))).toBeNull()
  })
})

describe('表示用の日時', () => {
  it('formatMonthDayTime は「10/14 21:03」', () => {
    expect(formatMonthDayTime(at(2026, 10, 14, 21, 3))).toBe('10/14 21:03')
  })

  it('formatTime は「09:05」', () => {
    expect(formatTime(at(2026, 10, 14, 9, 5))).toBe('09:05')
  })
})
