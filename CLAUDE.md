# CLAUDE.md

お店（秘宝館）の業務で使う集計用の静的サイト。GitHub Pages に置く（https://kei-devworks.github.io/hihoukan-calculator/）。
サーバーはなく、データは各端末の `localStorage` にだけ保存する。

## コマンド

```sh
npm run typecheck && npm run lint && npm test   # CI の check と同じ
npm run test:e2e                                  # E2E（iPhone・Android エミュレーション）
npm run build
```

## 構成

- `src/pages/` — 1ページ = 1フォルダ。`index.html` を置くとビルドの入口になる（`vite.config.ts` が自動で拾う）。
  「個数 × 単価」のページ（タクミ）は `config.ts`（`TallyConfig`）を `mountTallyApp` に、
  「在庫の差」のページ（ネコ）は `config.ts`（`StockConfig`）を `mountStockApp` に渡すだけ（docs/adding-a-page.md）
- `src/core/` — DOM に触れないロジック。単体テストはここが中心
- `src/ui/` — DOM の共通部品と共通スタイル
- `e2e/` — Playwright。本番と同じサブパス `/hihoukan-calculator/` で配信して流す

## 決まりごと

- 作業はブランチを切って PR にする。CI（check・e2e）が全部通ったら `gh pr merge --merge --delete-branch` でマージしてよい
- 実装を変えたら、対応するドキュメントを**同じ PR**で更新する

  | 変更内容 | 更新するドキュメント |
  | --- | --- |
  | 構成・保存の形・設定（`TallyConfig`）の型・画面のふるまいの変更 | `docs/architecture.md` |
  | ページの追加、品目・単価・画面の操作の変更 | `docs/usage.md`、`README.md` のページ一覧 |
  | ページの足し方が変わる変更（共通部品・設定の項目） | `docs/adding-a-page.md` |
  | デプロイ・ホスティングの変更、Pages の制約に関わる変更 | `docs/deployment.md` |
  | テストの方針・道具の変更 | `docs/testing.md` |
  | コマンド・セットアップの変更 | `README.md`、この CLAUDE.md |

- 公開したあと、ページ・品目・単価の id は変えない（保存済みの数が読めなくなる）。名前は変えてよい
- `localStorage` のキーは `hihoukan-calc:` で始める。`kei-devworks.github.io` の下のサイトは保存場所を共有するため（docs/deployment.md）。`localStorage.clear()` は使わない
- GitHub Pages でできないこと（サーバー処理・端末をまたいだ共有・ログイン）が要る機能は、作る前に相談する
- コードはセミコロンなし・シングルクォート・2スペース。コメントとドキュメントは日本語
