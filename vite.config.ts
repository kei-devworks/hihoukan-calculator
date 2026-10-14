import { globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const pagesRoot = resolve(projectRoot, 'src/pages')

/**
 * src/pages 以下の index.html をすべてビルドの入口にする。
 * ページを足すときに、この設定を書き換える必要はない（docs/adding-a-page.md）
 */
const input = Object.fromEntries(
  globSync('**/index.html', { cwd: pagesRoot }).map((file) => {
    const dir = dirname(file)
    return [dir === '.' ? 'portal' : dir, resolve(pagesRoot, file)]
  }),
)

export default defineConfig({
  root: pagesRoot,
  // 相対パスで出力する。GitHub Pages のサブパス（/hihoukan-calculator/）でも、
  // ほかのホスティングのルートでも、同じビルドがそのまま動く
  base: './',
  publicDir: resolve(projectRoot, 'public'),
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rolldownOptions: { input },
  },
})
