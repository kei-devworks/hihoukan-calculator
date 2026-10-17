import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr'

/** 左上・右上・左下にある位置合わせの印（7×7 の外枠が黒、その内側が白） */
function hasFinder(m: boolean[][], top: number, left: number): boolean {
  for (let i = 0; i < 7; i++) {
    const edge = [m[top]![left + i], m[top + 6]![left + i], m[top + i]![left], m[top + i]![left + 6]]
    if (edge.some((dark) => !dark)) return false
  }
  return m[top + 1]![left + 1] === false && m[top + 3]![left + 3] === true
}

describe('qrMatrix', () => {
  it('正方形で、3つの隅に位置合わせの印がある', async () => {
    const m = await qrMatrix('https://kei-devworks.github.io/hihoukan-calculator/')
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 17) % 4).toBe(0) // QR の大きさは 21, 25, 29, …（4 ずつ増える）
    for (const row of m) expect(row).toHaveLength(n)
    expect(hasFinder(m, 0, 0)).toBe(true)
    expect(hasFinder(m, 0, n - 7)).toBe(true)
    expect(hasFinder(m, n - 7, 0)).toBe(true)
  })

  it('同じ文字列なら同じ並びになり、長い文字列ほど大きくなる', async () => {
    const a = await qrMatrix('https://example.com/a')
    expect(await qrMatrix('https://example.com/a')).toEqual(a)
    const long = await qrMatrix(`https://example.com/#${'x'.repeat(300)}`)
    expect(long.length).toBeGreaterThan(a.length)
  })

  it('ASCII 以外の文字は受け付けない（URL にしてから渡す）', async () => {
    await expect(qrMatrix('ネコ・グリコ')).rejects.toThrow('ASCII')
  })
})
