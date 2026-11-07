/**
 * 閲覧数の中継（Cloudflare Worker）。ページから受け取った閲覧を、GoatCounter に送り直す。
 *
 * ページが GoatCounter に直接送ると、広告ブロッカーが goatcounter.com への通信を止める。
 * この中継の名前（<name>.<サブドメイン>.workers.dev）はブロックの一覧に載っておらず、
 * 中継から GoatCounter への通信は端末の外で起きるので、ブロッカーに止められない（docs/deployment.md）。
 *
 * 公開は `npm run worker:deploy`（docs/maintenance.md）。サイトの公開（GitHub Pages）とは別に、手で行う
 */
import { countUrl, GOATCOUNTER_ENDPOINT, parseRelayBody, SITE_ORIGIN } from '../src/core/analytics'

/** 本文の上限。このサイトが送るのは 200 バイトほど */
const MAX_BODY = 1024

export default {
  fetch: (request: Request) => relay(request, fetch),
}

/**
 * POST /v だけを受け付け、このサイトのページから来た・このサイトが送る形の閲覧だけを GoatCounter に送る。
 * ブラウザの種類（User-Agent）は引き継ぐ。GoatCounter がロボットを見分けるのと、ブラウザ・OS の集計に使う
 */
export async function relay(request: Request, send: typeof fetch): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (pathname !== '/v') return new Response(null, { status: 404 })
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (request.headers.get('Origin') !== SITE_ORIGIN) return new Response(null, { status: 403 })

  const body = await request.text()
  const hit = body.length <= MAX_BODY ? parseRelayBody(body) : null
  if (!hit) return new Response(null, { status: 400 })

  const response = await send(countUrl(GOATCOUNTER_ENDPOINT, hit), {
    headers: { 'User-Agent': request.headers.get('User-Agent') ?? '' },
  })
  return new Response(null, { status: response.ok ? 204 : 502 })
}
