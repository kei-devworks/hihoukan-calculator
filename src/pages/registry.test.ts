import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
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
