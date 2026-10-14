# テスト

| 種類 | 道具 | 置き場所 | 流すとき |
| --- | --- | --- | --- |
| 単体テスト | Vitest | `src/**/*.test.ts`（対象ファイルの隣） | `npm test`、CI、デプロイ前 |
| E2E | Playwright | `e2e/*.spec.ts` | `npm run test:e2e`、CI |
| 本番の確認（smoke） | Playwright（E2E と同じテスト） | `e2e/*.spec.ts` | デプロイのたびに自動、手元からは `npm run test:e2e:live` |

## 単体テスト

- 計算・保存・整形など、DOM に触れないロジック（`src/core/`）が中心。ここで正しさを細かく押さえる
- 既定は node 環境で速く回す。DOM が要るテストは、ファイルの先頭に `// @vitest-environment jsdom` を書く

## E2E

- iPhone（WebKit）と Android（Chromium）をエミュレートして、両方で同じテストを流す
- 本番と同じ `/hihoukan-calculator/` のサブパスで配信するので、相対パスの解決ミスもここで分かる
- `npm run test:e2e` はビルドしてから `vite preview` を立ち上げて流す。手元でサーバーが動いていれば再利用する
- 初回は `npx playwright install chromium webkit` でブラウザを入れる
- [browser-capabilities.spec.ts](../e2e/browser-capabilities.spec.ts) は、このサイトが頼るブラウザの機能
  （HTTPS 扱い・localStorage の保持・クリップボードへの書き込み）が配信先で使えるかを確かめる。
  本番でも流すのはこのため（[deployment.md](deployment.md)）

## CI

[ci.yml](../.github/workflows/ci.yml) が PR と `main` への push で動く。

1. **check**: 型チェック → lint → 単体テスト → ビルド
2. **e2e**: check が通ったら E2E。落ちたときは Playwright のレポートを Artifacts に残す
