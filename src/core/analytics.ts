/**
 * 閲覧数の計測（GoatCounter）のうち、DOM に触れない部分。送るのは ui/analytics.ts。
 *
 * 公開を続けるかを決めるために、ページを開いた回数と、月ごとに使われた端末の数を数える。
 * 送るのはページの id と題名、「使った端末」の月（'2026-11'）だけ。
 * 入力した数・URL の # のあと・端末を見分ける番号は送らない（docs/deployment.md）
 */
import { isRecord } from './guards'

/** 送り先。GoatCounter のサイトのコードを変えたら、ここも直す（docs/maintenance.md） */
export const GOATCOUNTER_ENDPOINT = 'https://hihoukan-calc.goatcounter.com/count'

/** 端末に保存する計測の状態 */
export interface AnalyticsState {
  /** 「使った端末」を最後に送った月（'2026-11'）。まだなら null */
  deviceMonth: string | null
  /** この端末の閲覧を数えない（管理者が自分の端末で #count-off にしたとき） */
  off: boolean
}

/** GoatCounter に送る1件 */
export interface Hit {
  /** ページの id（'/takumi'）か、イベントの名前（'device-2026-11'） */
  path: string
  title: string
  event?: boolean
}

const MONTH = /^\d{4}-\d{2}$/

/** 保存値を読み戻す。ない・壊れているときは初期値 */
export function parseAnalyticsState(raw: unknown): AnalyticsState {
  if (!isRecord(raw)) return { deviceMonth: null, off: false }
  return {
    deviceMonth: typeof raw.deviceMonth === 'string' && MONTH.test(raw.deviceMonth) ? raw.deviceMonth : null,
    off: raw.off === true,
  }
}

/** 手元で開いているときのホスト名（npm run dev、E2E の vite preview、同じ Wi-Fi の端末から開いたとき） */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|\[::1\])$|\.localhost$/

/**
 * 数えてよいか。手元で開いているとき・自動テスト（Playwright は navigator.webdriver が true。
 * 公開のあとに本番の URL へ流す smoke ジョブも含む）・この端末を数えない設定のときは数えない
 */
export function shouldCount(env: { hostname: string; webdriver: boolean; off: boolean }): boolean {
  return !env.off && !env.webdriver && !LOCAL_HOST.test(env.hostname)
}

/** URL の # が #count-off / #count-on なら、切り替えたあとの状態。ほかの # なら null */
export function toggleByHash(hash: string, state: AnalyticsState): AnalyticsState | null {
  if (hash === '#count-off') return { ...state, off: true }
  if (hash === '#count-on') return { ...state, off: false }
  return null
}

/** 端末の時刻での月。'2026-11' */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 「その月に使った端末」のイベント。月の名前のほかは何も入れない */
export function deviceHit(month: string): Hit {
  const [year, mm] = month.split('-')
  return { path: `device-${month}`, title: `${year}年${Number(mm)}月に使った端末`, event: true }
}

/**
 * ページを開いたときに送るもの。ページの閲覧は毎回、「使った端末」はその端末で月に1回だけ。
 * device が null でないときは、next を保存できてから送る（保存できない端末で開くたびに数えないため）
 */
export function visitHits(
  state: AnalyticsState,
  page: { path: string; title: string },
  now: Date,
): { page: Hit; device: Hit | null; next: AnalyticsState } {
  const month = monthKey(now)
  const pageHit: Hit = { path: page.path, title: page.title }
  if (state.deviceMonth === month) return { page: pageHit, device: null, next: state }
  return { page: pageHit, device: deviceHit(month), next: { ...state, deviceMonth: month } }
}

/**
 * GoatCounter の /count に送る URL。ns=1 で、同じ人の閲覧を8時間まとめる数え方をやめる。
 * これでダッシュボードの数が、ページの行では開いた回数、device-YYYY-MM の行では端末の数になる
 */
export function countUrl(endpoint: string, hit: Hit, rnd: string = Math.random().toString(36).slice(2, 7)): string {
  const params = new URLSearchParams({ p: hit.path, t: hit.title })
  if (hit.event) params.set('e', 'true')
  params.set('ns', '1')
  params.set('rnd', rnd)
  return `${endpoint}?${params.toString()}`
}
