/**
 * 引き継ぎを作る前に、お店の端末で「ページの中のカメラで QR を読めるか」などを確かめるページ。
 * ポータルには載せない（docs/deployment.md の「端末どうしの渡し方」）
 */
import '../../ui/base.css'
import { readJson, storageKey, writeJson, openLocalStorage } from '../../core/storage'
import { copyText } from '../../ui/clipboard'
import { byId, h } from '../../ui/dom'
import { pageHeader } from '../../ui/page-parts'
import { qrSvg } from '../../ui/qr'
import { qrScanner } from '../../ui/qr-scanner'

const root = byId('app')
const storage = openLocalStorage()

/** この開き方（ブラウザ・ホーム画面のアプリ）の保存場所の番号。開き方がちがえば番号もちがう */
function contextId(): string {
  const key = storageKey('check', 1)
  const saved = storage ? readJson(storage, key) : null
  if (typeof saved === 'string') return saved
  const id = Math.random().toString(36).slice(2, 6).toUpperCase()
  if (storage) writeJson(storage, key, id)
  return id
}

const id = storage ? contextId() : '（保存できない）'
const standalone =
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const fromLink = new URLSearchParams(location.hash.slice(1)).get('check')
if (location.hash) history.replaceState(null, '', location.pathname + location.search)

const facts: [string, string][] = [
  ['開き方', standalone ? 'ホーム画面のアプリ' : 'ブラウザ'],
  ['保存場所の番号', id],
  ['HTTPS', window.isSecureContext ? 'はい' : 'いいえ'],
  ['ページの中のカメラ', typeof navigator.mediaDevices?.getUserMedia === 'function' ? '使える見込み' : '使えない'],
  ['QR を読む機能（端末）', 'BarcodeDetector' in window ? 'あり' : 'なし（同梱の読み取りを使う）'],
  ['共有シート', typeof navigator.share === 'function' ? 'あり' : 'なし'],
  ['ブラウザ', navigator.userAgent],
]

const results: string[] = []
const resultList = h('ul', { class: 'check-results' })
const note = (text: string) => {
  results.push(text)
  resultList.append(h('li', { text }))
}
if (fromLink) {
  note(`リンクから開いた（QR を出した端末の番号 ${fromLink}）。この開き方の番号は ${id}。いつも使う開き方の番号と同じなら、保存場所はずれていない`)
}

const scanResult = h('p', { class: 'notice', hidden: true })
const scanner = qrScanner({
  onResult: (text) => {
    scanButton.textContent = 'もう一度読み取る'
    const code = (() => {
      try {
        return new URLSearchParams(new URL(text).hash.slice(1)).get('check')
      } catch {
        return null
      }
    })()
    const message = code ? `読めました（番号 ${code} の端末の QR）` : `読めました: ${text}`
    scanResult.hidden = false
    scanResult.textContent = message
    note(`ページの中のカメラで読めた（${code ? `番号 ${code}` : text}）`)
  },
  onError: (message) => {
    scanResult.hidden = false
    scanResult.textContent = message
    note(`カメラ: ${message}`)
  },
})
const scanButton = h('button', { type: 'button', class: 'solid', text: 'カメラで読み取る' })
scanButton.addEventListener('click', () => {
  scanResult.hidden = true
  if (scanner.running) {
    scanner.stop()
    scanButton.textContent = 'カメラで読み取る'
  } else {
    scanButton.textContent = 'やめる'
    void scanner.start()
  }
})

const link = `${location.origin}${location.pathname}#check=${encodeURIComponent(id)}`
const qrBox = h('div', { class: 'qr-box', text: 'QR コードを作っています…' })
qrSvg(link, 'この端末の確認用の QR コード').then((svg) => qrBox.replaceChildren(svg))

const shareButton = h('button', { type: 'button', class: 'ghost', text: '共有シートを出す' })
shareButton.disabled = typeof navigator.share !== 'function'
shareButton.addEventListener('click', () => {
  navigator.share({ title: '確認用のリンク', url: link }).then(
    () => note('共有シートから送れた'),
    (e: unknown) => note(`共有シート: ${e instanceof DOMException ? e.name : String(e)}`),
  )
})

const copyButton = h('button', { type: 'button', class: 'solid', text: '結果をコピー' })
copyButton.addEventListener('click', async () => {
  const text = ['QR の読み取りの確認', ...facts.map(([k, v]) => `${k}: ${v}`), ...results.map((r) => `- ${r}`)].join('\n')
  copyButton.textContent = (await copyText(text)) ? 'コピーしました' : 'コピーできませんでした'
  setTimeout(() => (copyButton.textContent = '結果をコピー'), 1600)
})

window.addEventListener('pagehide', () => scanner.stop())

root.replaceChildren(
  pageHeader('QR の読み取りの確認', [
    h('p', { class: 'lead', text: '引き継ぎを作る前に、この端末でできることを確かめるページです。結果をコピーして送ってください。' }),
  ]),
  h('section', { class: 'card' }, [
    h('h2', { text: 'この端末' }),
    h('dl', { class: 'check-facts' }, facts.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
  ]),
  h('section', { class: 'card check-step' }, [
    h('h2', { text: '1. ページの中のカメラで読む' }),
    h('p', { class: 'lead', text: 'もう1台の端末でこのページを開き、下の QR を出してもらって読み取ります。' }),
    scanButton,
    scanner.element,
    scanResult,
  ]),
  h('section', { class: 'card check-step' }, [
    h('h2', { text: '2. この端末の QR' }),
    h('p', {
      class: 'lead',
      text: 'もう1台のこのページの「カメラで読み取る」で読んでもらいます。カメラアプリで読むとリンクが開くので、そのときの開き方と番号も確かめます。',
    }),
    qrBox,
    shareButton,
  ]),
  h('section', { class: 'card check-step' }, [h('h2', { text: '3. 結果' }), resultList, copyButton]),
)
