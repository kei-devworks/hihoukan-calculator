import { defineConfig } from 'vitest/config'

// 単体テストは src/**/*.test.ts。DOM が要るテストはファイル先頭に
// `// @vitest-environment jsdom` を書く（既定は node 環境で速く回す）
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
