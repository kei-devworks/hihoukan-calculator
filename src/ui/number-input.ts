import { h, type Attrs } from './dom'

/** 欄に入ってからこの時間のうちのタップは、入るためのタップとみなす（カーソルを右に戻す） */
const FOCUS_TAP_MS = 700

/**
 * 数字を入れる欄。数字のキーボードを出し、欄に入ったらカーソルを数字のいちばん右に置く
 * （直すときに、後ろから消して打ち直しやすいように）。
 * type="number" はカーソルの位置を動かせない（setSelectionRange が使えない）ので、type="text" に inputmode="numeric" で数字のキーボードを出す。
 * 中身は文字なので、読むときは各画面で整数か確かめる
 */
export function numberInput(attrs: Attrs = {}): HTMLInputElement {
  const input = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'off',
    ...attrs,
    class: ['num', attrs.class].filter(Boolean).join(' '),
  })
  caretToEnd(input)
  return input
}

/**
 * 欄に入ったら、カーソルをいちばん右に置く。数字が右寄せなので、左の空いたところを押すと
 * カーソルが数字の左に行ってしまうため。入ったあとにもう一度押せば、押した位置に動かせる。
 * 文字を選んでいるとき（ダブルタップ・全部選んで打ち直すなど）は、選んだままにする
 */
export function caretToEnd(input: HTMLInputElement): void {
  let focusedAt = 0
  const toEnd = () => {
    if (document.activeElement !== input || input.selectionStart !== input.selectionEnd) return
    const end = input.value.length
    try {
      input.setSelectionRange(end, end)
    } catch {
      // カーソルを動かせない欄では何もしない
    }
  }
  input.addEventListener('focus', () => {
    focusedAt = Date.now()
    // 押した位置にカーソルを置く処理や、全部選ぶ処理は focus のあとに来るので、それが済んでから動かす
    // （focus の中で動かすと、あとから来る「全部選ぶ」を消してしまう）
    setTimeout(toEnd, 0)
  })
  input.addEventListener('click', () => {
    if (Date.now() - focusedAt > FOCUS_TAP_MS) return
    toEnd()
    setTimeout(toEnd, 0)
  })
}
