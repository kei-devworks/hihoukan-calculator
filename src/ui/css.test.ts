import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * かっこの閉じ忘れを見つける。閉じ忘れても CSS はエラーにならず、ブラウザは後ろのルールを
 * 前のルールの中の入れ子として読むので、後ろの見た目が黙って当たらなくなる（マージで `}` が消えて起きた）。
 * このサイトの CSS は入れ子を使わないので、{ } の中に { を置けるのは @media などの中だけにする
 */
function braceProblems(css: string): string[] {
  const problems: string[] = []
  // 開いているかっこごとに、@ で始まる規則（@media・@keyframes など）かどうか
  const open: { atRule: boolean; line: number }[] = []
  let line = 1
  let head = ''
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!
    if (c === '\n') line++
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const skipped = css.slice(i, end + 2)
      line += skipped.split('\n').length - 1
      i = end + 1
      continue
    }
    if (c === '{') {
      const parent = open.at(-1)
      if (parent && !parent.atRule) problems.push(`${line}行目: ${parent.line}行目のルールが閉じていない`)
      open.push({ atRule: head.trim().startsWith('@'), line })
      head = ''
    } else if (c === '}') {
      if (!open.pop()) problems.push(`${line}行目: 閉じかっこが多い`)
      head = ''
    } else if (c === ';') {
      head = ''
    } else {
      head += c
    }
  }
  for (const o of open) problems.push(`${o.line}行目: 最後まで閉じていない`)
  return problems
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  )
}

describe('CSS のかっこ', () => {
  it('見つける: 閉じ忘れ・入れ子・多すぎる閉じかっこ', () => {
    expect(braceProblems('.a { color: red; }\n@media (x) { .b { color: red; } }')).toEqual([])
    expect(braceProblems('.a { color: red;\n\n.b { color: red; }')).toEqual(['3行目: 1行目のルールが閉じていない', '1行目: 最後まで閉じていない'])
    expect(braceProblems('.a { }\n}')).toEqual(['2行目: 閉じかっこが多い'])
    expect(braceProblems('/* { */ .a { }')).toEqual([])
  })

  const files = cssFiles(join(__dirname, '..'))
  it('src の CSS が見つかる', () => {
    expect(files.length).toBeGreaterThan(0)
  })
  it.each(files.map((f) => [f.slice(f.indexOf('src/')), f]))('%s は閉じ忘れがない', (_, file) => {
    expect(braceProblems(readFileSync(file, 'utf8'))).toEqual([])
  })
})
