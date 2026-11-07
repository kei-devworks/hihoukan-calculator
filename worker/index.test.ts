import { describe, expect, it, vi } from 'vitest'
import { relay } from './index'

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'

const request = (body: string, init: { method?: string; path?: string; origin?: string | null } = {}) => {
  const headers = new Headers({ 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': UA })
  if (init.origin !== null) headers.set('Origin', init.origin ?? 'https://kei-devworks.github.io')
  return new Request(`https://hihoukan-calc.kei-devworks.workers.dev${init.path ?? '/v'}`, {
    method: init.method ?? 'POST',
    headers,
    body: (init.method ?? 'POST') === 'POST' ? body : undefined,
  })
}

const goatcounter = (status = 200) => vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status })))

describe('relay', () => {
  it('ページの閲覧を、ns=1 とブラウザの種類を付けて GoatCounter に送る', async () => {
    const send = goatcounter()
    const response = await relay(request('{"p":"/takumi","t":"タクミ売上カウンター"}'), send)
    expect(response.status).toBe(204)
    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0]!
    const sent = new URL(String(url))
    expect(sent.origin + sent.pathname).toBe('https://hihoukan-calc.goatcounter.com/count')
    expect(sent.searchParams.get('p')).toBe('/takumi')
    expect(sent.searchParams.get('t')).toBe('タクミ売上カウンター')
    expect(sent.searchParams.get('ns')).toBe('1')
    expect(sent.searchParams.has('e')).toBe(false)
    expect(init?.headers).toEqual({ 'User-Agent': UA })
  })

  it('「使った端末」はイベントとして送る', async () => {
    const send = goatcounter()
    await relay(request('{"p":"device-2026-11","t":"2026年11月に使った端末","e":true}'), send)
    expect(new URL(String(send.mock.calls[0]![0])).searchParams.get('e')).toBe('true')
  })

  it.each([
    ['ほかのサイトから', request('{"p":"/takumi","t":"x"}', { origin: 'https://example.com' }), 403],
    ['Origin がない（curl など）', request('{"p":"/takumi","t":"x"}', { origin: null }), 403],
    ['GET', request('', { method: 'GET' }), 405],
    ['ほかのパス', request('{"p":"/takumi","t":"x"}', { path: '/count' }), 404],
    ['このサイトが送る形でない', request('{"p":"https://example.com/","t":"x"}'), 400],
    ['本文が大きすぎる', request(JSON.stringify({ p: '/takumi', t: 'x', pad: 'x'.repeat(2000) })), 400],
  ])('%s のものは送らない', async (_, req, status) => {
    const send = goatcounter()
    expect((await relay(req, send)).status).toBe(status)
    expect(send).not.toHaveBeenCalled()
  })

  it('GoatCounter が受け付けなければ 502', async () => {
    expect((await relay(request('{"p":"/takumi","t":"x"}'), goatcounter(400))).status).toBe(502)
  })
})
