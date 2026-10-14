/**
 * 文字列をクリップボードにコピーする。できたら true。
 * Clipboard API（HTTPS とボタン操作が条件）→ 古いブラウザ向けの execCommand の順に試す
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 権限がない・フォーカスがないなど。下の方法を試す
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  // iOS で画面が拡大・スクロールしないよう、見えない位置に読み取り専用で置く
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  area.style.fontSize = '16px'
  document.body.append(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/** 要素の中身を選択状態にする（コピーできなかったとき、長押しでコピーしてもらうため） */
export function selectContents(el: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}
