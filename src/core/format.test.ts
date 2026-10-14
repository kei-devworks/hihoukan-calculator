import { describe, expect, it } from 'vitest'
import { formatNumber, formatYen } from './format'

describe('formatNumber', () => {
  it('3桁ごとにカンマで区切る', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(800)).toBe('800')
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
})

describe('formatYen', () => {
  it('報告文の「￥1,234-」の形にする', () => {
    expect(formatYen(0)).toBe('￥0-')
    expect(formatYen(8600)).toBe('￥8,600-')
  })
})
