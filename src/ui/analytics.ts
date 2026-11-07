/**
 * 閲覧数を送る。何を送るか・数えない条件は core/analytics.ts。
 *
 * 公式の count.js は読み込まない。売上や勤務の記録がある保存場所で、外のスクリプトを動かさないため。
 * 送る先は GoatCounter ではなく自分の中継（worker/index.ts）で、送り方は fetch。
 * 広告ブロッカーの一覧が、goatcounter.com への通信と、ほかのサイトへの sendBeacon（ping）を止めるため（docs/deployment.md）
 */
import {
  COUNT_RELAY_URL,
  parseAnalyticsState,
  relayBody,
  shouldCount,
  toggleByHash,
  visitHits,
  type Hit,
} from '../core/analytics'
import { openLocalStorage, readJson, storageKey, writeJson } from '../core/storage'

const KEY = storageKey('analytics', 1)

/**
 * ページを開いたことを送る。各ページの入口（portal.ts・<フォルダ>/main.ts）の最初で1回呼ぶ。
 * path はページの id（'/takumi' など）。URL ではなく id で送るので、`…/index.html` で開いても、
 * 公開先の URL が変わっても、同じ行で数える。
 * 計測でページが止まらないよう、失敗はすべて捨てる
 */
export function countVisit(path: string): void {
  try {
    const storage = openLocalStorage()
    let state = parseAnalyticsState(storage ? readJson(storage, KEY) : null)

    // 管理者が自分の端末を数えないようにする（docs/maintenance.md）。# は消しておく
    const toggled = toggleByHash(location.hash, state)
    if (toggled) {
      const saved = storage !== null && writeJson(storage, KEY, toggled)
      if (saved) state = toggled
      history.replaceState(null, '', location.pathname + location.search)
      alert(
        !saved
          ? 'この端末では保存できないため、切り替えられませんでした。'
          : toggled.off
            ? 'この端末の閲覧は、これから数えません。'
            : 'この端末の閲覧を、また数えます。',
      )
    }

    if (!shouldCount({ hostname: location.hostname, webdriver: navigator.webdriver === true, off: state.off })) return

    const { page, device, next } = visitHits(state, { path, title: document.title }, new Date())
    send(page)
    // 「使った端末」は、送ったことを保存できたときだけ送る。保存できない端末で、開くたびに数えないように
    if (device && storage && writeJson(storage, KEY, next)) send(device)
  } catch {
    // 計測が止まっても、ページはそのまま使える
  }
}

/**
 * 中継に送る。本文は文字列なので Content-Type は text/plain になり、事前の確認（preflight）なしで届く。
 * keepalive で、すぐ別のページへ移っても送り切る。返事は読まず、届かなくても何もしない
 */
function send(hit: Hit): void {
  fetch(COUNT_RELAY_URL, { method: 'POST', mode: 'no-cors', keepalive: true, body: relayBody(hit) }).catch(() => {})
}
