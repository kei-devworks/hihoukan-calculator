import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr'
import { readQr } from './qr-read'

/** QR の点の並びを、1マス scale 画素・余白4マスの白黒の画像（RGBA）にする */
async function render(text: string, scale = 4) {
  const matrix = await qrMatrix(text)
  const size = (matrix.length + 8) * scale
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4
          data[i] = data[i + 1] = data[i + 2] = 0
        }
      }
    }),
  )
  return { data, size }
}

describe('readQr', () => {
  it('作った QR コードを読み戻すと、同じ文字列になる（引き継ぎのリンクの長さでも）', async () => {
    for (const text of [
      'https://kei-devworks.github.io/hihoukan-calculator/',
      `https://kei-devworks.github.io/hihoukan-calculator/takumi/#hikitsugi=${'eyJ2IjoxLCJhdCI6IjIwMjYtMTAtMTdUMTY6NDI'.repeat(6)}`,
    ]) {
      const { data, size } = await render(text)
      expect(await readQr(data, size, size)).toBe(text)
    }
  })

  it('QR がなければ null', async () => {
    const blank = new Uint8ClampedArray(100 * 100 * 4).fill(255)
    expect(await readQr(blank, 100, 100)).toBeNull()
  })
})
