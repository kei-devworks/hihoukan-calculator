# 秘宝館 計算機

お店の業務で使う集計用の Web ページ集です。端末のブラウザだけで動き、サーバーは使いません。

**公開先: https://kei-devworks.github.io/hihoukan-calculator/**

| ページ | 内容 |
| --- | --- |
| [タクミ売上カウンター](https://kei-devworks.github.io/hihoukan-calculator/takumi/) | 串・ホタテ・ビール・ソフトクリームの売上を数え、1時間ごとの売上報告の定型文をコピーする（[使い方](docs/usage.md#タクミ売上カウンター)） |
| [ネコ売上カウンター](https://kei-devworks.github.io/hihoukan-calculator/neko/) | 弓道・手裏剣のステッカー・絵馬・手形を、開店時の在庫・追加・残数から売上にする。弓道と手裏剣は分けて出す（[使い方](docs/usage.md#ネコ売上カウンター)） |
| [勤務時間報告](https://kei-devworks.github.io/hihoukan-calculator/kinmu/) | 勤務日・勤務時間・休憩・交通費から報告文を作ってコピーする。交通費のパターンと前回の勤務日・勤務時間を覚えておく（[使い方](docs/usage.md#勤務時間報告)） |

どのページも数字は端末に保存され、再読み込みしても消えません。

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
node scripts/make-icons.mjs  # public/favicon.svg を直したら、PNG のアイコンを作り直す
```

`main` にマージすると GitHub Pages に自動でデプロイされます。

## ドキュメント

- [docs/usage.md](docs/usage.md) — 使い方（お店のスタッフ向け）
- [docs/adding-a-page.md](docs/adding-a-page.md) — 集計ページを足す手順
- [docs/architecture.md](docs/architecture.md) — 構成、集計の設定（`TallyConfig`）、保存の形と決まりごと
- [docs/deployment.md](docs/deployment.md) — デプロイのしくみ、GitHub Pages で使えるかの精査と注意点
- [docs/testing.md](docs/testing.md) — テストの方針と流し方
