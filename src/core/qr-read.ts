/**
 * 画像の点の並びから QR コードを読む（DOM に触れない）。ライブラリは使うときだけ読み込む
 */

/** RGBA の画素（ImageData.data と同じ並び）から QR コードを読む。読めなければ null */
export async function readQr(data: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  // 画面に出した QR（白地に黒）を読むので、白黒を反対にした読み取りは試さない（速くするため）
  return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
}
