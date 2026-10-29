import { describe, expect, it } from 'vitest'
import { decodeHandoverCode, encodeHandoverCode, handoverLink, hasHandoverCode, type HandoverCode } from './handover-code'
import { qrMatrix } from './qr'

const page = 'https://kei-devworks.github.io/hihoukan-calculator/takumi/'

const code: HandoverCode = {
  v: 1,
  at: '2026-10-17T07:42:00Z',
  counts: { skewer1: 12, skewer2: 5, hotate: 6, beer: 9, vanilla: 8, matcha: 3, 'x-mgx8k2': 2 },
  custom: [
    { i: 'x-mgx8k2', s: 'soft', n: 'チョコトッピング', p: 100 },
    { i: 'x-mgx9a1', s: 'meat', n: null, p: 7000 },
  ],
  floatStart: { bundle: 2, '500': 10, '100': 30 },
  total: 41500,
}

describe('引き継ぎのデータ', () => {
  it('リンクにして読み戻すと、同じデータになる（日本語の名前も）', () => {
    const link = handoverLink(page, code)
    expect(link.startsWith(`${page}#hikitsugi=`)).toBe(true)
    expect(decodeHandoverCode(link)).toEqual(code)
  })

  it('リンクは ASCII だけで、QR コードにできる長さに収まる', async () => {
    const link = handoverLink(page, code)
    expect(link).toMatch(/^[\x20-\x7e]+$/)
    expect(link.length).toBeLessThan(700)
    expect((await qrMatrix(link)).length).toBeGreaterThan(0)
  })

  it('ページの URL に # が付いていても、付け替える', () => {
    expect(handoverLink(`${page}#hikitsugi=old`, code)).toBe(handoverLink(page, code))
  })

  it('# のあとだけ・文の中のリンクからも取り出せる', () => {
    const encoded = encodeHandoverCode(code)
    expect(decodeHandoverCode(`#hikitsugi=${encoded}`)).toEqual(code)
    expect(decodeHandoverCode(`引き継ぎです ${page}#hikitsugi=${encoded} よろしく`)).toEqual(code)
    expect(hasHandoverCode(`${page}#hikitsugi=${encoded}`)).toBe(true)
    expect(hasHandoverCode('売上報告\n21:00時点')).toBe(false)
  })

  it('0 の品目は持たない', () => {
    const decoded = decodeHandoverCode(handoverLink(page, { ...code, counts: { skewer1: 0, beer: 2 } }))
    expect(decoded?.counts).toEqual({ beer: 2 })
  })

  it('壊れたデータ・形のちがうデータは読まない（例外にしない）', () => {
    const link = (value: unknown) => `${page}#hikitsugi=${encodeHandoverCode(value as HandoverCode)}`
    expect(decodeHandoverCode(page)).toBeNull()
    expect(decodeHandoverCode(`${page}#hikitsugi=%%%`)).toBeNull()
    expect(decodeHandoverCode(`${page}#hikitsugi=bm90IGpzb24`)).toBeNull() // "not json"
    expect(decodeHandoverCode(link({ ...code, v: 2 }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, at: 'きのう' }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, total: -1 }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, counts: { beer: -2 } }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, counts: { beer: 1.5 } }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, custom: [{ i: 'beer', s: 'meat', n: null, p: 100 }] }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, custom: [{ i: 'x-a', s: 'meat', n: null, p: 0 }] }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, floatStart: { abc: 1 } }))).toBeNull()
    expect(decodeHandoverCode(link({ ...code, counts: undefined }))).toBeNull()
  })
})
