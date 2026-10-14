# 秘宝館 計算機

お店の業務で使う集計用の Web ページ集です。端末のブラウザだけで動き、サーバーは使いません。

**公開先: https://kei-devworks.github.io/hihoukan-calculator/**

## 開発

Node.js 24 以上（[.nvmrc](.nvmrc)）。

```sh
npm install
npx playwright install chromium webkit   # 初回だけ。E2E 用のブラウザ

npm run dev            # 開発サーバー
npm run typecheck      # 型チェック
npm run lint           # lint
npm test               # 単体テスト
npm run test:e2e       # E2E（ビルドして iPhone・Android のエミュレーションで確認）
npm run test:e2e:live  # 本番の URL に対して E2E
npm run build          # dist/ にビルド
```

`main` にマージすると GitHub Pages に自動でデプロイされます。

## ドキュメント

- [docs/deployment.md](docs/deployment.md) — デプロイのしくみ、GitHub Pages で使えるかの精査と注意点
- [docs/testing.md](docs/testing.md) — テストの方針と流し方
