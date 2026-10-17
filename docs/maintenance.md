# 保守と管理者の交代

このサイトを保守する人のための手順。ふだんの保守は [日々の保守](#日々の保守)、
管理者が代わるとき（リポジトリの譲渡を含む）は [管理者を代えるとき](#管理者を代えるとき)。

## 先に知っておくこと

管理者を代えるときに効いてくるのは、次の3つ。

- **サイトの URL は、リポジトリの持ち主の名前で決まる。** いまは `https://kei-devworks.github.io/hihoukan-calculator/`。
  持ち主が変われば `https://<新しい持ち主>.github.io/hihoukan-calculator/` になる
- **数字は各端末のブラウザ（localStorage）にだけあり、保存場所はサイトのドメインごとに分かれる。** リポジトリにもサーバーにも売上は残っていない。
  URL のドメインが変わると、端末に保存したもの（画面から足した品目・変えた単価・釣り銭準備金の開店時の枚数・勤務時間報告の記録とパターン・その日の数）は、
  新しい URL では見えない。ホーム画面のアイコン・配った QR・ブックマークも古い URL のまま
- **GitHub はリポジトリを譲渡すると、リポジトリと git の URL は新しい場所へ転送するが、GitHub Pages のサイトは転送しない**
  （[GitHub Docs: Transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)）。
  譲渡した時点で、古い URL のサイトは開けなくなる

ほかに、無料のプランで Pages を使うため、リポジトリは公開（Public）にしている。非公開にするとサイトが止まる。
公開なので、売上・スタッフの名前・パスワードなどはリポジトリに書かない。

## 管理者を代えるとき

### どの方法にするか

| 方法 | サイトの URL | 端末のデータ | 新しい管理者ができること | 向いているとき |
| --- | --- | --- | --- | --- |
| A. コラボレーターに加える | 変わらない | そのまま | 変更・PR・マージ（マージすれば今までどおり自動でデプロイ）。人の追加・公開範囲・削除などの設定は持ち主だけ | 持ち主のアカウントは残し、保守だけ任せる |
| B. Organization を作って移す | 1回だけ変わる（`<organization>.github.io`） | 切り替える日に入れ直す | オーナーなら全部。次の交代はメンバーの出し入れだけで、URL は変わらない | 長く使う。**持ち主を手放すならこれ** |
| C. 個人アカウントに譲渡する | 変わる（`<新しい人>.github.io`） | 切り替える日に入れ直す | 全部 | 次の人に丸ごと渡す（その次の交代でまた URL が変わる） |

- まず **A で足りるか** を考える。URL もデータも変わらず、お店の人の手間がない
- 持ち主のアカウントを手放すなら **B**。Organization は無料で作れる。オーナーを2人以上にしておけば、1人が抜けても止まらない
- 独自ドメイン（例: `calc.example.jp`）を割り当てると、URL と保存場所を GitHub のアカウントから切り離せる（以後の交代で URL が変わらない）。
  ドメインの費用がかかり、割り当てるときに1回 URL が変わる。必要になったら相談する

### A. コラボレーターに加える

1. 持ち主: リポジトリの Settings → Collaborators → **Add people** で、新しい人の GitHub アカウントを招待する
2. 新しい人: 招待を承認して、[日々の保守](#日々の保守) の準備をする
3. Pages・Environments の設定や人の追加が要るときは、持ち主に頼む

### B・C. 譲渡する

#### 前もって（持ち主）

1. 譲渡先を用意する
   - B: GitHub で Organization を作る（Free でよい）。自分と新しい管理者をオーナーにする
   - C: 新しい人の GitHub アカウント（2段階認証を有効にしてもらう）
   - 譲渡先に `hihoukan-calculator` という名前のリポジトリがあると譲渡できない
2. 新しい URL（`https://<譲渡先>.github.io/hihoukan-calculator/`）と、切り替える日を決めて、お店の人に伝える。
   **営業の前（その日の数を 0 にしたあと）** にする。その日の数は端末にしかなく、移す手間がいちばん少ない
3. 端末にしかないものを、できるだけ設定に移す（新しい URL では見えなくなるため）
   - タクミで画面から足した品目・変えた単価 → `src/pages/takumi/config.ts` に書いてデプロイする（全部の端末に出る。[adding-a-page.md](adding-a-page.md)）
   - 釣り銭準備金の開店時の枚数（タクミ・ネコ・グリコのレジ精算）→ メモしておく
   - 勤務時間報告の交通費のパターン・前回の勤務時間 → 各自メモしておく。受領済みの勤務日は、新しい URL で「受領済みの勤務日」の欄から直せる
4. 開いている PR をマージするか閉じ、`main` の CI と、最後のデプロイが通っていることを確かめる

営業の途中で切り替えるしかないとき、タクミの数は引き継ぎで移せる。**譲渡の前に**、各端末で［引き継ぎ］→［次の人に渡す］→［リンクをコピー］して、
メモアプリなどに残す。切り替えたあと、新しい URL で［引き継ぎ］→［前の人から受け取る］→［報告文を貼る］にそのリンクを貼って引き継ぐ
（数・足した品目・釣り銭準備金の開店時の枚数が入る。リンクのドメインが古くても、`#hikitsugi=` のあとのデータだけを読む）。
ネコ・グリコと勤務時間報告には移す機能がないので、入れ直す。端末のデータを書き出して移す機能が要るなら、譲渡の前に作る（Pages のままで作れる。相談）。

#### 譲渡（持ち主）

5. リポジトリの Settings → General → いちばん下の Danger Zone → **Transfer ownership** で、譲渡先を入れる
   - B（Organization）: すぐに移る
   - C（個人）: 新しい人にメールが届き、**1日以内に承認しないと無効になる**
6. この時点で、古い URL のサイトは開けなくなる

#### 譲渡のあと（新しい管理者）

7. 設定を確かめる
   - Settings → Pages の Source が **GitHub Actions**
   - Settings → Environments → `github-pages` の Deployment branches に `main` がある
8. Actions → **Deploy to GitHub Pages** → **Run workflow** で手動でデプロイする。新しい URL で開けること、
   続けて流れる本番の E2E（Smoke test on GitHub Pages）が通ることを確かめる
9. リポジトリの中の古い URL を書き換える PR を出す。`grep -rn "kei-devworks" .` で探す
   - README.md・CLAUDE.md・docs/・`package.json` の `test:e2e:live`・`src/core/storage.ts` のコメント
   - テストの中の例の URL は動きに関係ないので、そのままでもよい
10. 手元の clone の送り先を変える: `git remote set-url origin git@github.com:<譲渡先>/hihoukan-calculator.git`
11. C のとき、元の持ち主はコラボレーターとして残る。要らなければ Settings → Collaborators で外す

#### お店の端末（切り替える日）

12. 新しい URL を開き、ホーム画面に追加し直す。古いアイコンは消す。新しい URL は、ポータルの［共有］の QR で配れる
13. 釣り銭準備金の開店時の枚数（レジ精算）と、勤務時間報告の交通費のパターンを入れ直す

### 古い URL から新しい URL へ転送する（任意）

古い URL のアイコン・QR・ブックマークから、新しい URL へ自動で移るようにできる。元の持ち主のアカウントに、
同じ名前の公開リポジトリ `hihoukan-calculator` を新しく作り、次の中身のファイルを `index.html`（入口）と `404.html`（`/takumi/` などほかのページ）の
2つの名前で置いて、Settings → Pages → **Deploy from a branch**（`main` / root）で公開する。`NEW-OWNER` は譲渡先の名前に直す。

```html
<!doctype html>
<html lang="ja">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>移転しました</title>
<script>
  // 同じページ（/takumi/ など）と、# のあと（引き継ぎのデータ）を保ったまま新しい URL へ移る
  const to = 'https://NEW-OWNER.github.io/hihoukan-calculator/'
  location.replace(to + location.pathname.replace(/^\/hihoukan-calculator\/?/, '') + location.search + location.hash)
</script>
<p>新しい場所に移りました: <a href="https://NEW-OWNER.github.io/hihoukan-calculator/">https://NEW-OWNER.github.io/hihoukan-calculator/</a></p>
</html>
```

- 移るのは URL だけで、端末のデータは移らない（保存場所が別のため）。ホーム画面のアイコンは、新しい URL から追加し直してもらう
- 古い場所に同じ名前のリポジトリを作ると、GitHub のリポジトリと git の URL の転送はなくなる。手元の clone の送り先を先に変えておく

## 日々の保守

### 準備

- このリポジトリに書き込める GitHub アカウント
- Node.js 24 以上（[.nvmrc](../.nvmrc)）
- `npm ci` と `npx playwright install chromium webkit`（E2E のブラウザ）。コマンドの一覧は [README.md](../README.md#開発)

### 変更の流れ

1. `main` からブランチを切る
2. 直したら `npm run typecheck && npm run lint && npm test` と `npm run test:e2e`
3. 対応するドキュメントも同じ PR で直す（どれを直すかは [CLAUDE.md](../CLAUDE.md) の表）
4. PR を出し、CI（check・e2e）が通ったらマージする
5. `main` にマージすると自動でデプロイされ、本番の URL に対して E2E が流れる（[deployment.md](deployment.md)）。
   Actions で緑になったことを確かめる。端末に反映されるまで最大10分ほどかかる

### よくある頼まれごと

| 頼まれごと | 直すところ |
| --- | --- |
| 値上げ・単価の変更（全部の端末） | `src/pages/<ページ>/config.ts` の `prices` の `default` |
| 品目を足す（全部の端末） | 同じファイルの `sections`。id は英小文字・数字・`-`、`x-` で始めない |
| 品目・見出しの名前を変える | `name`・`title`・`label`（id は変えない） |
| ページを足す | [adding-a-page.md](adding-a-page.md) |
| 報告文の形を変える | 頼まれたときだけ。テスト（`config.test.ts`・E2E）の期待値も一緒に直す |

### 守ること

- 公開したあと、ページ・品目・単価の id は変えない（保存済みの数が読めなくなる）
- 保存の形を変えるときは版を上げ、古い版を読み替える（[architecture.md](architecture.md) の「保存」）
- `localStorage` のキーは `hihoukan-calc:` で始め、`localStorage.clear()` は使わない。同じ持ち主の `github.io` のサイトは保存場所を共有する
- どのページも検索に出さない（各ページの `noindex, nofollow`。テストで確かめている）
- サーバー・ログイン・端末をまたいだ共有が要る機能は、作る前に相談する（Pages ではできない。[deployment.md](deployment.md)）
- 公開リポジトリなので、売上・個人の情報・秘密の値は書かない

### ときどきやること

- 依存の更新: `npm outdated` で確かめ、上げたら全部のテストを流す。Playwright を上げたら `npx playwright install chromium webkit` もやり直す
- GitHub Actions（`.github/workflows/*.yml` の `actions/*@v7` など）と Node.js（`.nvmrc`）は、Actions に古いという警告が出たら上げる
- デプロイが落ちたら Actions のログを見る。止まったときの対処は [deployment.md](deployment.md#デプロイが止まったとき)

### Claude Code で保守するとき

- 決まりごとは [CLAUDE.md](../CLAUDE.md) にあり、リポジトリと一緒に引き継がれる。前の管理者の手元にある Claude の記憶（memory）は引き継がれない
- 前の管理者が頼んでいたこと: ブランチ → PR → CI が通ったらマージまで任せる。コミットは PR より細かく分ける。報告は日本語
- 勤務時間報告の文面は全角スペースを使う。コードでは `\u3000` と書き、書いたあと grep で確かめる（書き込みのときに全角スペースそのものに化けることがあった）
