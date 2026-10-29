/**
 * 引き継ぎのデータ（QR とリンクの `#hikitsugi=` に入れる）の作成と読み取り（DOM に触れない）。
 * JSON を UTF-8 にして base64url にする。リンクの `#` のあとはサーバーへ送られない（docs/deployment.md）
 */

import { BUNDLE } from './cash'
import { isCount, isDateString, isRecord } from './guards'

/** リンクの `#` のあとに付ける名前 */
export const HANDOVER_PARAM = 'hikitsugi'

export type HandoverCode = {
  v: 1
  /** 渡した時刻（ISO 8601） */
  at: string
  /** 品目 id → その時点の数（0 の品目は持たない） */
  counts: Record<string, number>
  /** 画面から足した品目（i: id、s: 見出しの id、n: 名前、p: 単価） */
  custom: { i: string; s: string; n: string | null; p: number }[]
  /** 開店時の釣り銭準備金（硬貨の額面 → 枚数、BUNDLE → 1万円の束の数） */
  floatStart: Record<string, number>
  /** その時点の合計（受け取った側で照合する） */
  total: number
}

/** 壊れたデータや、ほかのものの QR を読み込みすぎないための上限 */
const MAX_KEYS = 200
const MAX_TEXT = 4000
const ID = /^[A-Za-z0-9_-]{1,64}$/
const CUSTOM_ID = /^x-[a-z0-9-]+$/

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

export function encodeHandoverCode(code: HandoverCode): string {
  return toBase64Url(JSON.stringify(code))
}

/** ページの URL（`#` より前）に、引き継ぎのデータを付けたリンク */
export function handoverLink(pageUrl: string, code: HandoverCode): string {
  return `${pageUrl.split('#')[0]}#${HANDOVER_PARAM}=${encodeHandoverCode(code)}`
}

/** 文字列に引き継ぎのデータ（`hikitsugi=…`）が入っているか。リンク・`#` のあとだけ・文の中のリンクのどれでもよい */
export function hasHandoverCode(text: string): boolean {
  return new RegExp(`${HANDOVER_PARAM}=[A-Za-z0-9_-]`).test(text)
}

/**
 * リンク（または `#hikitsugi=…` を含む文）から引き継ぎのデータを取り出す。
 * 壊れている・形がちがうときは null（例外にしない）
 */
export function decodeHandoverCode(text: string): HandoverCode | null {
  if (text.length > MAX_TEXT) return null
  const match = text.match(new RegExp(`${HANDOVER_PARAM}=([A-Za-z0-9_-]+)`))
  const json = match ? fromBase64Url(match[1]!) : null
  if (json === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.v !== 1 || !isDateString(raw.at) || !isCount(raw.total)) return null
  if (!isRecord(raw.counts) || !isRecord(raw.floatStart) || !Array.isArray(raw.custom)) return null

  const counts: Record<string, number> = {}
  const countEntries = Object.entries(raw.counts)
  if (countEntries.length > MAX_KEYS) return null
  for (const [id, n] of countEntries) {
    if (!ID.test(id) || !isCount(n)) return null
    if (n > 0) counts[id] = n
  }

  const custom: HandoverCode['custom'] = []
  if (raw.custom.length > MAX_KEYS) return null
  for (const c of raw.custom) {
    if (!isRecord(c) || typeof c.i !== 'string' || !CUSTOM_ID.test(c.i) || typeof c.s !== 'string' || !ID.test(c.s)) return null
    if (!(c.n === null || typeof c.n === 'string') || !isCount(c.p) || c.p === 0) return null
    custom.push({ i: c.i, s: c.s, n: c.n, p: c.p })
  }

  const floatStart: Record<string, number> = {}
  for (const [d, n] of Object.entries(raw.floatStart)) {
    // 硬貨の額面と、1万円の束の数（BUNDLE）
    if (!(/^[1-9][0-9]{0,5}$/.test(d) || d === BUNDLE) || !isCount(n)) return null
    floatStart[d] = n
  }
  return { v: 1, at: raw.at, counts, custom, floatStart, total: raw.total }
}
