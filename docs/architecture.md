# 設計

## 全体像

- サーバーのない静的サイト。GitHub Pages に置く（[deployment.md](deployment.md)）
- 1ページ = 1つの集計ツール。ページは `src/pages/<名前>/` に置き、ポータル（`src/pages/index.html`）から開く
- 数字は**各端末のブラウザ（localStorage）にだけ**保存する。端末どうしで共有はしない

## ディレクトリ

```
src/
  core/          DOM に触れないロジック。単体テストの中心
    catalog.ts     品目・単価・見出しの設定（Catalog）の型と検証。売上を数えるページ共通の土台
    tally.ts       「個数 × 単価」の計算・保存値の読み戻し
    tally-store.ts TallyState を端末に保存・復元する
    report.ts      売上報告の定型文
    json-store.ts  1ページ分の状態を JSON で保存・復元する（JsonStore。各ページの store の土台）
    storage.ts     localStorage の薄い包み（キーの接頭辞・例外を投げない読み書き）
    guards.ts      保存値を読み戻すときの型の確かめ
    time.ts        報告時刻・営業日・日時の表示
    format.ts      金額の表示
  ui/            DOM の共通部品と共通スタイル
    page-parts.ts  ページ共通の部品: 見出し、保存の状態、前の営業日の知らせ、表示を新しく保つしくみ
    tally-app.ts   TallyConfig から「個数 × 単価」の画面を組み立てる（mountTallyApp）
    tally.css      その画面だけのスタイル
    base.css       全ページ共通の色・余白・カード・知らせ・ボタン・ポータル
    clipboard.ts   コピー（Clipboard API → execCommand → 選択して長押し）
    confirm-button.ts  2回押すと実行するボタン（リセット用）
    dom.ts         要素を作る小さなヘルパー
  pages/         Vite の入口。1ページ = 1フォルダ
    index.html     ポータル
    registry.ts    ポータルに並べるページの一覧
    takumi/        タクミ売上カウンター（config.ts に品目・単価）
e2e/             Playwright
```

ページを足す手順は [adding-a-page.md](adding-a-page.md)。

依存の向きは `pages → ui → core` の一方通行。`core` は DOM も `window` も使わない
（`storage.ts` の `openLocalStorage` だけが `window.localStorage` に触れる）。

## ページの共通部分

売上を数えるページは、どれも次の土台の上に作る。

| 土台 | 中身 |
| --- | --- |
| `Catalog`（`core/catalog.ts`） | ページの id・題名・営業日の切り替わり・単価（`prices`）・見出しごとの品目（`sections`）。`validateCatalog` で書き間違いを見つける |
| `JsonStore`（`core/json-store.ts`） | 状態を `hihoukan-calc:<ページの id>:v<版>` に保存・復元する。読み戻しはページごとの `parse` 関数に任せ、壊れた値でも例外にしない |
| `earlierBusinessDay`（`core/time.ts`） | 「数え始めた時刻」が前の営業日かを判定する（前日の数字が残っている知らせに使う） |
| `pageHeader` / `pageStatus` / `keepFresh`（`ui/page-parts.ts`） | 「‹ 一覧」と題名、保存の状態と赤い警告、前の営業日の黄色い知らせ、30秒ごと・画面復帰・別タブ・戻るボタンでの再描画 |

## 「個数 × 単価」の集計（tally）

売上カウンターのような「品目ごとに個数を数え、単価を掛けて足す」ページは、**設定（`TallyConfig`）を書くだけ**で作れる。
計算・保存・報告文・画面はすべて設定から組み立てる。`TallyConfig` は `Catalog` に報告文の1行目（`reportTitle`）を足したもの。

```ts
const config: TallyConfig = {
  id: 'takumi',                 // 保存のキー。公開したら変えない
  title: 'タクミ売上カウンター',
  reportTitle: '売上報告',        // 報告文の1行目
  dayStartHour: 4,              // 営業日の切り替わり（深夜 3:59 までは前日扱い）
  prices: [                     // 単価。画面の「単価設定」に並ぶ順
    { id: 'skewer1', label: '串①', default: 1000 },
    { id: 'soft', label: 'ソフト（共通）', default: 800 },
  ],
  sections: [                   // 見出しごとの品目。画面と報告文に出る順
    { id: 'meat', title: '◾️肉', items: [
      { id: 'skewer1', priceId: 'skewer1' },          // name なし → 「1,000円」と値段で呼ぶ
    ] },
    { id: 'soft', title: '◾️ソフト', items: [
      { id: 'vanilla', name: 'バニラ', priceId: 'soft' }, // 単価を共有
      { id: 'matcha', name: '抹茶', priceId: 'soft' },
    ] },
  ],
}
```

設定の書き間違い（id の重複、存在しない単価など）は `validateCatalog` が見つける。
登録されている全ページの設定をテストで検証するので、書き間違えると CI が落ちる。

### 状態と更新

```ts
type TallyState = {
  counts: Record<string, number>          // 品目 id → 個数（0 の品目は持たない）
  priceOverrides: Record<string, number>  // 既定から変えた単価だけ
  updatedAt: string | null                // 最後に個数を変えた時刻
  startedAt: string | null                // いまの数字を 0 から数え始めた時刻（全部 0 に戻ると消える）
}
```

- 更新は `bump` / `setPrice` / `resetCounts` などの純関数で、新しい状態を返す（元の状態は書き換えない）
- 画面は「状態を変える → `TallyStore.update` で保存 → 描き直す」の順に動く

### 画面（`mountTallyApp`）

設定から行・小計・合計・単価設定・報告文を組み立て、状態が変わるたびに `render()` で表示を合わせる。

| 画面の要素 | ふるまい |
| --- | --- |
| ＋ / − | `bump` → 保存 → 描き直し。ボタンの読み上げ名は「1,000円を1つ増やす」 |
| 報告時刻 | 初期値はいまに一番近い「ちょうど」。手で変えなければ、30秒ごと・画面に戻ったときにいまの時刻へ合わせ直す（開きっぱなしの端末向け）。「今」で自動に戻る |
| 保存の状態 | 「この端末に保存済み（最終更新 21:03）」。保存できない・失敗したときは赤い知らせ |
| 前の営業日の知らせ | `carriedOverSince` が時刻を返すあいだ出し続け、「0 に戻して今日を始める」（2回押し）で消える |
| 単価設定 | 入力のたびに `setPrice`。欄が空の間は変えず、欄から離れると今の単価に戻す。変えた単価には既定値を並べ、見出しに件数を出す |
| コピー | Clipboard API → execCommand。どちらもだめなら報告文を選択して「長押しでコピー」と出す |
| リセット | 2回押し（3秒以内）。単価の変更は残す |

ほかに、同じ端末の別のタブで数字が変わったら（`storage` イベント）、戻るボタンでキャッシュから表示されたら（`pageshow`）、保存を読み直す。

## 保存

| 項目 | 内容 |
| --- | --- |
| 場所 | ブラウザの `localStorage`（端末 × ブラウザごと） |
| キー | `hihoukan-calc:<ページの id>:v<版>`（例: `hihoukan-calc:takumi:v1`） |
| 中身 | `TallyState` の JSON |
| 書くとき | 個数・単価を変えるたび |

```json
{
  "counts": { "skewer1": 3, "vanilla": 2 },
  "priceOverrides": {},
  "updatedAt": "2026-10-15T12:03:00.000Z",
  "startedAt": "2026-10-15T01:10:00.000Z"
}
```

### 決まりごと

- **キーは必ず `hihoukan-calc:` で始める。** `kei-devworks.github.io` の下のサイトは保存場所を共有するため
- **公開したあと、ページ・品目・単価の id は変えない。** 変えると保存済みの数が読めなくなる。名前（`name`・`label`・`title`）は変えてよい
- 保存の形を変えるときは版（`TALLY_STORAGE_VERSION`）を上げ、古い版を読み替える処理を足す
- 読み戻し（`parseState`）は何が来ても例外にしない。壊れた値・設定から消えた品目・負の数は捨てる

### 設計の判断

- **日付が変わっても自動では消さない。** 深夜まで営業した日に、集計の途中で数字が消えるのを防ぐため。
  前の営業日の数字が残っていれば画面で知らせ、消すのは人が「リセット」を押したときだけ。
  判定は**数え始めた時刻**（`startedAt`）で行う（`carriedOverSince`）。最終更新の時刻で判定すると、
  残った数字に今日の分を1つ足しただけで知らせが消え、前日と今日の数字が混ざるため
- **単価は既定から変えたものだけ保存する。** 値上げなどでコードの既定値を直してデプロイしたとき、
  端末に古い単価が残り続けないようにするため
- **保存できない端末でも動く。** `TallyStore` は storage が使えなければメモリ上だけで動き、画面で「保存できない」と知らせる
