# テスト

| 種類 | 道具 | 置き場所 | 流すとき |
| --- | --- | --- | --- |
| 単体テスト | Vitest | `src/**/*.test.ts`（対象ファイルの隣） | `npm test`、CI、デプロイ前 |
| E2E | Playwright | `e2e/*.spec.ts` | `npm run test:e2e`、CI |
| 本番の確認（smoke） | Playwright（E2E と同じテスト） | `e2e/*.spec.ts` | デプロイのたびに自動、手元からは `npm run test:e2e:live` |

## 単体テスト

- 計算・保存・整形など、DOM に触れないロジック（`src/core/`）が中心。ここで正しさを細かく押さえる
- 既定は node 環境で速く回す。DOM が要るテストは、ファイルの先頭に `// @vitest-environment jsdom` を書く
- 時間帯は `Asia/Tokyo` に固定している（[vitest.config.ts](../vitest.config.ts)）。営業日や報告時刻は端末の時刻で決まるため、
  CI（UTC）でも手元でも同じ結果になるようにしている。E2E も同じ時間帯

- 画面（`src/ui/tally-app.test.ts`・`src/ui/stock-app.test.ts`）も jsdom で流す。時計（`now`）と保存先を差し替えられるので、
  「前の営業日の数字が残っている」「深夜営業で日付をまたぐ」「保存できない端末」のような、実機では作りにくい状況をここで確かめる
- ページの設定は `src/pages/registry.test.ts` が `src/pages/*/config.ts` を全部拾って `validateCatalog` にかける
  （「個数 × 単価」も「在庫の差」も同じ形なので、ページを足してもテストを書き足さなくてよい）。
  報告文の定型や1日分の計算は、各ページの `config.test.ts` で固定する

## E2E

- iPhone（WebKit）と Android（Chromium）をエミュレートして、両方で同じテストを流す
- 本番と同じ `/hihoukan-calculator/` のサブパスで配信するので、相対パスの解決ミスもここで分かる
- `npm run test:e2e` はビルドしてから `vite preview` を立ち上げて流す。手元でサーバーが動いていれば再利用する
- 初回は `npx playwright install chromium webkit` でブラウザを入れる
- [takumi.spec.ts](../e2e/takumi.spec.ts) は売上カウンターを実際に操作する: 定型文の生成とコピー、
  リロード・開き直し後も数字が残ること、2回押しのリセット、単価の変更、前の営業日の知らせ、別のタブとの同期、
  ポータルとの行き来、スマホの幅で横にはみ出さないこと。時計は `page.clock` で固定する
- [neko.spec.ts](../e2e/neko.spec.ts) は在庫の差のページを操作する: 開店時・追加・残数から弓道と手裏剣の売上を分けて出すこと、
  残数を入れる前の表示、リロード・開き直し後も残ること、残数が多すぎるときの知らせ、次の日に残数を開店時へ移すこと、リセット
- [browser-capabilities.spec.ts](../e2e/browser-capabilities.spec.ts) は、このサイトが頼るブラウザの機能
  （HTTPS 扱い・localStorage の保持・クリップボードへの書き込み）が配信先で使えるかを確かめる。
  本番でも流すのはこのため（[deployment.md](deployment.md)）

## CI

[ci.yml](../.github/workflows/ci.yml) が PR と `main` への push で動く。

1. **check**: 型チェック → lint → 単体テスト → ビルド
2. **e2e**: check が通ったら E2E。落ちたときは Playwright のレポートを Artifacts に残す
