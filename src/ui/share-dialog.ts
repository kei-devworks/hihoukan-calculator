import { copyText } from './clipboard'
import { h } from './dom'
import { qrSvg } from './qr'

export type ShareDialogOptions = {
  /** ダイアログの見出し（例: 'このサイトを共有'） */
  title: string
  /** 共有するリンク。QR にも入れる */
  url: string
  /** QR の下に添える説明 */
  note?: string
  /** QR コードの読み上げ名。省略すると「（見出し）の QR コード」 */
  qrLabel?: string
}

/**
 * リンクを QR・共有シート（AirDrop・LINE など）・コピーで渡すダイアログを開く。閉じると取り除く。
 * 共有シートは navigator.share がある端末（iPhone・Android）だけに出す
 */
export function openShareDialog(options: ShareDialogOptions): HTMLDialogElement {
  const qrBox = h('div', { class: 'qr-box', text: 'QR コードを作っています…' })
  const copyButton = h('button', { type: 'button', class: 'ghost', text: 'リンクをコピー' })
  const closeButton = h('button', { type: 'button', class: 'ghost', text: '閉じる' })
  const buttons: HTMLElement[] = []
  if (typeof navigator.share === 'function') {
    const shareButton = h('button', { type: 'button', class: 'solid', text: 'AirDrop・LINE などで送る' })
    shareButton.addEventListener('click', () => {
      // 共有シートを閉じただけのとき（AbortError）も含め、失敗しても何もしない
      navigator.share({ title: options.title, url: options.url }).catch(() => {})
    })
    buttons.push(shareButton)
  }
  buttons.push(copyButton)

  const dialog = h('dialog', { class: 'share-dialog', 'aria-labelledby': 'share-dialog-title' }, [
    h('h2', { id: 'share-dialog-title', text: options.title }),
    qrBox,
    ...(options.note ? [h('p', { class: 'share-note', text: options.note })] : []),
    h('p', { class: 'share-url', text: options.url }),
    h('div', { class: 'share-actions' }, buttons),
    h('div', { class: 'share-close' }, [closeButton]),
  ])

  let copyTimer: ReturnType<typeof setTimeout> | undefined
  copyButton.addEventListener('click', async () => {
    clearTimeout(copyTimer)
    copyButton.textContent = (await copyText(options.url)) ? 'コピーしました' : 'コピーできませんでした'
    copyTimer = setTimeout(() => (copyButton.textContent = 'リンクをコピー'), 1600)
  })
  const close = () => {
    clearTimeout(copyTimer)
    if (typeof dialog.close === 'function') dialog.close()
    dialog.remove()
  }
  closeButton.addEventListener('click', close)
  dialog.addEventListener('close', () => dialog.remove())
  // ダイアログの外（背景）を押したら閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close()
  })

  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')

  qrSvg(options.url, options.qrLabel ?? `${options.title}の QR コード`).then(
    (svg) => qrBox.replaceChildren(svg),
    () => (qrBox.textContent = 'QR コードを作れませんでした。下のリンクを使ってください。'),
  )
  return dialog
}
