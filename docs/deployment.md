# デプロイと GitHub Pages

公開先: https://kei-devworks.github.io/hihoukan-calculator/

## しくみ

- `main` に push（PR をマージ）すると [deploy.yml](../.github/workflows/deploy.yml) が動き、
  単体テスト → `npm run build` → `dist/` を GitHub Pages に公開する
- 公開のあと、同じ workflow の **smoke** ジョブが本番の URL に対して E2E を流す
  （iPhone・Android のエミュレーション）。保存・コピー・表示が本番でも動くことを毎回確かめる
- Pages の公開元は「GitHub Actions」（リポジトリの Settings → Pages）。ブランチからの公開は使わない
- 手で公開し直したいときは、Actions の「Deploy to GitHub Pages」から **Run workflow**

ビルドは相対パス（Vite の `base: './'`）で出力するので、`/hihoukan-calculator/` のようなサブパスでも、
独自ドメインのルートでも、同じ成果物がそのまま動く。

### デプロイが止まったとき

`actions/deploy-pages` が `updating_pages` のまま10分たつと、打ち切られて失敗になる。
GitHub 側の反映待ちで起きることがあり（初回のデプロイで実際に起きた）、ビルドの成果物は無事なので、
Actions の画面から **Re-run failed jobs** するか、次のマージを待てばよい。
smoke ジョブが落ちたときは、本番で保存・コピー・表示のどれかが動いていないので、Artifacts の `playwright-report-live` を見る。

## GitHub Pages で使えるかの精査（2026-10-15）

このサイトに要ることが、GitHub Pages で実現できるかを確かめた。結論として**すべて実現できる**。
注意点は次の節にまとめる。

| 要ること | 可否 | 根拠 |
| --- | --- | --- |
| HTML・CSS・JS の配信 | ○ | Pages は静的ファイルの配信サービス。ビルドは Actions で行い、`dist/` を置く。サーバー側の処理は動かせないが、このサイトでは使わない |
| 複数ページ（将来の集計ページ） | ○ | フォルダごとの `index.html` が `/hihoukan-calculator/<フォルダ>/` で開ける。E2E は本番と同じサブパスで配信して確かめている |
| HTTPS | ○ | `http://` は `https://` へ 301 でリダイレクトされる（実測）。Pages の設定も `https_enforced: true` |
| 端末ごとの保存（リロードで消えない） | ○ | ブラウザの `localStorage` を使う。サーバーは関係しない。E2E でリロード後・開き直し後も残ることを確認 |
| 定型文のコピー | ○ | Clipboard API の条件は「HTTPS」と「ボタン操作の中で呼ぶこと」で、どちらも満たす。Pages はクリップボードを止めるヘッダー（Permissions-Policy など）を付けない（実測）。E2E でボタンからの書き込みを確認 |
| 容量・転送量 | ○ | 上限はサイト 1 GB、転送量は月 100 GB（ソフトリミット）。このサイトは数十 KB |
| デプロイの回数 | ○ | 「1時間に10回」のビルド上限は、Actions のワークフローで公開する場合は対象外 |
| 料金 | ○ | 公開リポジトリなら無料。非公開リポジトリでは今のプランだと使えない（API が 422 を返すことを確認）ため、リポジトリを公開した |
| 利用規約 | ○ | 禁止されているのは、オンラインビジネス・EC・商取引のためのサイトや商用 SaaS としての利用と、パスワードやカード番号の送信。このサイトは店内で使う計算機で、取引も個人情報の送信もない |
| 表示の速さ | ○ | 東京のエッジから配信される（`x-github-edge-region: japaneast` を実測） |

本番の URL でも、`e2e/browser-capabilities.spec.ts`（HTTPS 扱い・リロードと開き直し後の localStorage・ボタンからのクリップボード書き込み）
とポータルの表示を iPhone・Android のエミュレーションで流し、8/8 通過した
（[2026-10-15 の deploy run](https://github.com/kei-devworks/hihoukan-calculator/actions/runs/38594948318)）。
以後はデプロイのたびに smoke ジョブが同じ確認をする。HTTPS には HSTS（`strict-transport-security`）も付いている。

出典: [GitHub Pages の制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、
[WebKit: 7-Day Cap on All Script-Writeable Storage](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)、
[WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

## 注意点と対策

### 保存は「端末 × ブラウザ」ごと

- 同じ iPhone でも、Safari・Chrome・**ホーム画面に追加したアプリ**は、それぞれ別の保存場所になる。
  お店では端末ごとに開き方をどれか1つに決めて使う
- **プライベートブラウズ**では、タブを閉じると消える。使わない
- iPhone の Safari は、そのサイトを開かないまま Safari を **7日間**使い続けると、保存を消すことがある。
  売上の数字はその日のうちに使い切るので影響は小さい。単価を画面で変えていた場合は既定値に戻るので、
  単価が変わったときは画面ではなくページの設定（コード）を直してデプロイするのが確実

### 同じアカウントの Pages は保存場所を共有する

`kei-devworks.github.io` の下のサイトは、リポジトリが違っても同じオリジン（保存場所）になる。
ほかのリポジトリでも Pages を使うと、互いの `localStorage` が読み書きできてしまう。

- 対策: 保存のキーには必ず `hihoukan-calc:` で始まる名前を使う。`localStorage.clear()` は使わない
- 完全に分けたいときは、独自ドメインを割り当てる

### 更新の反映に最大10分ほどかかる

Pages は `cache-control: max-age=600` を返す（実測）。デプロイ直後は、端末によって古いページが出ることがある。
JS・CSS はファイル名にハッシュが付くので、古い HTML と新しい JS が混ざることはない。

### URL を知っていれば誰でも開ける

Pages のサイトにアクセス制限はかけられない。検索結果に出ないよう、各ページに `noindex` を付けている。
売上の数字は端末の中にしかないので、ほかの人がページを開いても見えない。

## GitHub Pages ではできないこと

将来のページでこれらが要るときは、置き場所から相談する。

- **端末をまたいだ集計・共有**（例: 複数スタッフの端末の売上を合算する）。データを置くサーバーが要る
  （Supabase、Firebase、Google スプレッドシート + Apps Script など）
- ログインやアクセス制限
- API キーなどの秘密の値を使う処理
- HTTP ヘッダーの設定（CSP など）
- 決済や個人情報の送信（規約上も不可）
