// 閲覧数の中継が、広告ブロッカーの一覧に止められていないかを確かめる（docs/deployment.md の「閲覧数の計測」）。
// 広告ブロッカーと同じ判定エンジンに、よく使われる一覧を読ませ、ページから中継への fetch を判定する。
// 一覧は日々更新されるので、.github/workflows/blocklists.yml が毎週流す。手元では `npm run check:blocklists`
import { readFileSync } from 'node:fs'
import { FiltersEngine, Request } from '@ghostery/adblocker'

const source = readFileSync(new URL('../src/core/analytics.ts', import.meta.url), 'utf8')
const constant = (name) => {
  const value = source.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]
  if (!value) throw new Error(`src/core/analytics.ts に ${name} が見つからない`)
  return value
}
const relay = constant('COUNT_RELAY_URL')
const page = `${constant('SITE_ORIGIN')}/hihoukan-calculator/takumi/`
// 判定が効いていることの確かめ。GoatCounter に直接送ると、どれかの一覧に止められるはず
const direct = `${constant('GOATCOUNTER_ENDPOINT')}?p=%2Ftakumi&ns=1`

const lists = {
  EasyList: 'https://easylist.to/easylist/easylist.txt',
  EasyPrivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  'AdGuard Base': 'https://filters.adtidy.org/extension/ublock/filters/2.txt',
  'AdGuard Tracking Protection': 'https://filters.adtidy.org/extension/ublock/filters/3.txt',
  'AdGuard Japanese': 'https://filters.adtidy.org/extension/ublock/filters/7.txt',
  'uBlock filters': 'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'uBlock filters – Privacy': 'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
}

/** 止める規則。止めなければ null */
const blockedBy = (engine, url, type) => {
  const result = engine.match(Request.fromRawDetails({ url, sourceUrl: page, type }))
  return result.match && !result.exception ? (result.filter?.toString() ?? '(不明な規則)') : null
}

let relayBlocked = false
let directBlocked = false
for (const [name, url] of Object.entries(lists)) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name} を取れなかった（${response.status}）`)
  const engine = FiltersEngine.parse(await response.text())
  // ページは fetch で送る（ブロッカーの分類では xmlhttprequest）
  const relayRule = blockedBy(engine, relay, 'xmlhttprequest')
  const directRule = blockedBy(engine, direct, 'xmlhttprequest')
  relayBlocked ||= relayRule !== null
  directBlocked ||= directRule !== null
  console.log(`${name}\n  中継: ${relayRule ? `止められる（${relayRule}）` : '通る'}\n  GoatCounter に直接: ${directRule ? `止められる（${directRule}）` : '通る'}`)
}

if (!directBlocked) {
  console.error('\nGoatCounter に直接送るのを止める一覧がない。一覧の取り方か判定が変わったおそれがあるので、確かめる')
  process.exit(1)
}
if (relayBlocked) {
  console.error(`\n中継（${relay}）が止められている。docs/maintenance.md の「閲覧数を見る」を見て、中継の名前を変える`)
  process.exit(1)
}
console.log(`\n中継（${relay}）は、どの一覧にも止められていない`)
