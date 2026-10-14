import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateConfig, type TallyConfig } from '../core/tally'
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

// src/pages/*/config.ts が書き出す TallyConfig をすべて拾って検証する。ページを足すとき、テストを書き足す必要はない
const configModules = import.meta.glob<Record<string, unknown>>('./*/config.ts', { eager: true })
const tallyConfigs = Object.entries(configModules).flatMap(([file, mod]) =>
  Object.values(mod)
    .filter((v): v is TallyConfig => typeof v === 'object' && v !== null && 'sections' in v && 'prices' in v)
    .map((config) => ({ file, config })),
)

describe('各ページの集計の設定', () => {
  it('1つ以上ある', () => {
    expect(tallyConfigs.length).toBeGreaterThan(0)
  })

  it.each(tallyConfigs)('$file に書き間違いがない', ({ config }) => {
    expect(validateConfig(config)).toEqual([])
  })

  it('ページの id（保存のキー）が重複しない', () => {
    const ids = tallyConfigs.map(({ config }) => config.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
