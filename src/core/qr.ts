/**
 * QR コードの点の並び（DOM に触れない）。ライブラリはページを開くときに読み込まず、使うときだけ読み込む
 */

/**
 * text を QR コードにした点の並び（行ごとに、黒なら true）。余白は含まない。
 * text は ASCII だけにする（URL は `new URL(...).href` にすれば日本語も % で表される）
 */
export async function qrMatrix(text: string): Promise<boolean[][]> {
  if (!/^[\x20-\x7e]*$/.test(text)) throw new Error('QR コードには ASCII の文字だけを渡してください')
  const { default: qrcode } = await import('qrcode-generator')
  // 誤り訂正は M（約15%まで欠けても読める）。画面に出して読むので十分
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)))
}
