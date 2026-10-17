import { h } from './dom'

export type NoticeBar = {
  element: HTMLElement
  /** 知らせを出す。undo を渡すと［元に戻す］を出す */
  show: (text: string, undo?: () => void) => void
  hide: () => void
  readonly visible: boolean
}

/** ［元に戻す］のあとに出す「元に戻しました」を出しておく時間 */
const DONE_MS = 2500

/**
 * 画面の下に出す知らせ（［元に戻す］と［×］つき）。durationMs たつか、［×］で消える。
 * 読み上げは aria-live で伝える（role="status" は保存の状態の表示が使っているので付けない）
 */
export function noticeBar(durationMs = 3 * 60_000): NoticeBar {
  const text = h('span', { class: 'notice-bar-text' })
  const undoButton = h('button', { type: 'button', class: 'notice-bar-undo', text: '元に戻す' })
  const closeButton = h('button', { type: 'button', class: 'notice-bar-close', 'aria-label': 'お知らせを閉じる', text: '×' })
  const element = h('div', { class: 'notice-bar', 'aria-live': 'polite', hidden: true }, [text, undoButton, closeButton])

  let onUndo: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const hide = () => {
    clearTimeout(timer)
    onUndo = undefined
    element.hidden = true
  }
  const show = (message: string, undo?: () => void, ms = durationMs) => {
    clearTimeout(timer)
    text.textContent = message
    onUndo = undo
    undoButton.hidden = !undo
    element.hidden = false
    timer = setTimeout(hide, ms)
  }

  undoButton.addEventListener('click', () => {
    const undo = onUndo
    if (!undo) return
    undo()
    show('元に戻しました', undefined, DONE_MS)
  })
  closeButton.addEventListener('click', hide)

  return {
    element,
    show: (message, undo) => show(message, undo),
    hide,
    get visible() {
      return !element.hidden
    },
  }
}
