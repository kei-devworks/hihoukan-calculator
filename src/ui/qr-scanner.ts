import { readQr } from '../core/qr-read'
import { h } from './dom'

export type QrScannerOptions = {
  /** 読めたとき（読めたらカメラを止める） */
  onResult: (text: string) => void
  /** カメラが使えないとき。message はそのまま画面に出せる文 */
  onError: (message: string) => void
}

export type QrScanner = {
  element: HTMLElement
  start: () => Promise<void>
  stop: () => void
  readonly running: boolean
}

/** 読み取りに使う画像の幅（大きいほど遅い。画面に出した QR を読むのには十分） */
const SCAN_WIDTH = 640
/** 読み取りを試す間かく（ミリ秒） */
const SCAN_INTERVAL = 200

/**
 * ページの中のカメラで QR コードを読む。ページの中で読むので、ホーム画面のアイコンから開いていても
 * いつもの保存場所のまま使える（カメラアプリで読むと Safari で開いてしまうため。docs/deployment.md）
 */
export function qrScanner(options: QrScannerOptions): QrScanner {
  const video = h('video', { class: 'qr-video', playsinline: true, muted: true, autoplay: true, 'aria-label': 'カメラの映像' })
  // iPhone の Safari で全画面にならずに映すために、属性とプロパティの両方を付ける
  video.muted = true
  video.playsInline = true
  const element = h('div', { class: 'qr-scanner', hidden: true }, [video, h('span', { class: 'qr-frame', 'aria-hidden': 'true' })])
  const canvas = document.createElement('canvas')
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    clearTimeout(timer)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    video.srcObject = null
    element.hidden = true
  }

  const scan = async () => {
    if (!stream) return
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = context.getImageData(0, 0, canvas.width, canvas.height)
        const text = await readQr(image.data, image.width, image.height)
        if (text !== null && stream) {
          stop()
          options.onResult(text)
          return
        }
      }
    }
    timer = setTimeout(scan, SCAN_INTERVAL)
  }

  const start = async () => {
    if (stream) return
    if (!navigator.mediaDevices?.getUserMedia) {
      options.onError('このブラウザでは、ページの中でカメラを使えません。報告文の貼り付けか、打ち込みを使ってください。')
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      element.hidden = false
      video.srcObject = stream
      await video.play()
      timer = setTimeout(scan, SCAN_INTERVAL)
    } catch (error) {
      stop()
      const name = error instanceof DOMException ? error.name : ''
      options.onError(
        name === 'NotAllowedError'
          ? 'カメラの使用が許可されていません。端末の設定で、このブラウザのカメラを許可してください。'
          : name === 'NotFoundError'
            ? 'カメラが見つかりません。'
            : `カメラを開けませんでした（${name || String(error)}）。`,
      )
    }
  }

  return {
    element,
    start,
    stop,
    get running() {
      return stream !== null
    },
  }
}
