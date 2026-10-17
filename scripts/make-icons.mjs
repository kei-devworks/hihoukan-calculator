// public/favicon.svg から PNG のアイコンを書き出す（SVG のアイコンを表示できない iOS 26 より前の Safari と、ホーム画面のアイコン用）。
// favicon.svg を直したら `node scripts/make-icons.mjs` で作り直してコミットする
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const publicDir = resolve(import.meta.dirname, '../public')
const svg = await readFile(resolve(publicDir, 'favicon.svg'), 'utf8')

const icons = [
  // タブ用。背景は透明
  { file: 'favicon-32.png', size: 32, background: 'transparent', scale: 1 },
  // ホーム画面用。iPhone が角を丸めるので、背景を塗って的を少し小さく置く
  { file: 'apple-touch-icon.png', size: 180, background: '#f4f5f2', scale: 0.78 },
]

const browser = await chromium.launch()
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    const inner = Math.round(icon.size * icon.scale)
    await page.setContent(
      `<body style="margin:0;width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center;background:${icon.background}">` +
        `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
    )
    await page.screenshot({ path: resolve(publicDir, icon.file), omitBackground: icon.background === 'transparent' })
    await page.close()
    console.log(`public/${icon.file}（${icon.size}px）`)
  }
} finally {
  await browser.close()
}
