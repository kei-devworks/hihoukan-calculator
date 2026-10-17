import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { looksLikeCatalog, validateCatalog } from '../core/catalog'
import { pages } from './registry'

describe('pages（ポータルの一覧）', () => {
  it('どのページにも src/pages/<path>/index.html がある', () => {
    for (const page of pages) {
      expect(existsSync(resolve(import.meta.dirname, page.path, 'index.html')), page.path).toBe(true)
    }
  })

  it('path は URL にそのまま使える形で、重複しない', () => {
    const paths = pages.map((p) => p.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path).toMatch(/^[a-z0-9-]+$/)
  })
})

// src/pages/*/config.ts が書き出す設定（品目・単価・見出し）をすべて拾って検証する。
// 「個数 × 単価」でも「在庫の差」でも同じ形なので、ページを足すときテストを書き足す必要はない
const configModules = import.meta.glob<Record<string, unknown>>('./*/config.ts', { eager: true })
const catalogs = Object.entries(configModules).flatMap(([file, mod]) =>
  Object.values(mod)
    .filter(looksLikeCatalog)
    .map((config) => ({ file, config })),
)

describe('各ページの集計の設定', () => {
  it('1つ以上ある', () => {
    expect(catalogs.length).toBeGreaterThan(0)
  })

  it.each(catalogs)('$file に書き間違いがない', ({ config }) => {
    expect(validateCatalog(config)).toEqual([])
  })

  it('ページの id（保存のキー）が重複しない', () => {
    const ids = catalogs.map(({ config }) => config.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// QR やリンクで渡して店の中で使うサイトなので、検索には出さない（docs/deployment.md）。
// ページを足すときに付け忘れないよう、src/pages の index.html を全部見る
describe('検索に出さない', () => {
  const htmlFiles = globSync('**/index.html', { cwd: import.meta.dirname })

  it('ポータルと、ポータルに載っているページの HTML をすべて見ている', () => {
    expect(htmlFiles.length).toBeGreaterThanOrEqual(pages.length + 1)
  })

  it.each(htmlFiles)('%s に noindex, nofollow の meta がある', (file) => {
    const html = readFileSync(resolve(import.meta.dirname, file), 'utf8')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
  })
})
