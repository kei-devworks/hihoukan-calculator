import { defineConfig } from 'vitest/config'

// 営業日や報告時刻は端末の時刻で決まる。お店の時間帯で流し、CI（UTC）でも結果が変わらないようにする
// （E2E も playwright.config.ts で同じ時間帯にしている）
process.env.TZ = 'Asia/Tokyo'

// 単体テストは src/**/*.test.ts。DOM が要るテストはファイル先頭に
// `// @vitest-environment jsdom` を書く（既定は node 環境で速く回す）
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
