# 設計

## 全体像

- サーバーのない静的サイト。GitHub Pages に置く（[deployment.md](deployment.md)）
- 1ページ = 1つの集計ツール。ページは `src/pages/<名前>/` に置き、ポータル（`src/pages/index.html`）から開く
- 数字は**各端末のブラウザ（localStorage）にだけ**保存する。端末どうしで共有はしない

## ディレクトリ

```
src/
  core/          DOM に触れないロジック。単体テストの中心
    tally.ts       「個数 × 単価」の設定の型・計算・保存値の読み戻し・設定の検証
    tally-store.ts TallyState を端末に保存・復元する
    report.ts      売上報告の定型文
    storage.ts     localStorage の薄い包み（キーの接頭辞・例外を投げない読み書き）
    time.ts        報告時刻・営業日・日時の表示
    format.ts      金額の表示
  ui/            DOM の共通部品と共通スタイル
  pages/         Vite の入口。1ページ = 1フォルダ
    index.html     ポータル
    registry.ts    ポータルに並べるページの一覧
e2e/             Playwright
```

依存の向きは `pages → ui → core` の一方通行。`core` は DOM も `window` も使わない
（`storage.ts` の `openLocalStorage` だけが `window.localStorage` に触れる）。

## 「個数 × 単価」の集計（tally）

売上カウンターのような「品目ごとに個数を数え、単価を掛けて足す」ページは、**設定（`TallyConfig`）を書くだけ**で作れる。
計算・保存・報告文・画面はすべて設定から組み立てる。

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

設定の書き間違い（id の重複、存在しない単価など）は `validateConfig` が見つける。
登録されている全ページの設定をテストで検証するので、書き間違えると CI が落ちる。

### 状態と更新

```ts
type TallyState = {
  counts: Record<string, number>          // 品目 id → 個数（0 の品目は持たない）
  priceOverrides: Record<string, number>  // 既定から変えた単価だけ
  updatedAt: string | null                // 最後に個数を変えた時刻
}
```

- 更新は `bump` / `setPrice` / `resetCounts` などの純関数で、新しい状態を返す（元の状態は書き換えない）
- 画面は「状態を変える → `TallyStore.update` で保存 → 描き直す」の順に動く

## 保存

| 項目 | 内容 |
| --- | --- |
| 場所 | ブラウザの `localStorage`（端末 × ブラウザごと） |
| キー | `hihoukan-calc:<ページの id>:v<版>`（例: `hihoukan-calc:takumi:v1`） |
| 中身 | `TallyState` の JSON |
| 書くとき | 個数・単価を変えるたび |

```json
{ "counts": { "skewer1": 3, "vanilla": 2 }, "priceOverrides": {}, "updatedAt": "2026-10-15T12:03:00.000Z" }
```

### 決まりごと

- **キーは必ず `hihoukan-calc:` で始める。** `kei-devworks.github.io` の下のサイトは保存場所を共有するため
- **公開したあと、ページ・品目・単価の id は変えない。** 変えると保存済みの数が読めなくなる。名前（`name`・`label`・`title`）は変えてよい
- 保存の形を変えるときは版（`TALLY_STORAGE_VERSION`）を上げ、古い版を読み替える処理を足す
- 読み戻し（`parseState`）は何が来ても例外にしない。壊れた値・設定から消えた品目・負の数は捨てる

### 設計の判断

- **日付が変わっても自動では消さない。** 深夜まで営業した日に、集計の途中で数字が消えるのを防ぐため。
  前の営業日の数字が残っていれば画面で知らせ、消すのは人が「リセット」を押したときだけ
- **単価は既定から変えたものだけ保存する。** 値上げなどでコードの既定値を直してデプロイしたとき、
  端末に古い単価が残り続けないようにするため
- **保存できない端末でも動く。** `TallyStore` は storage が使えなければメモリ上だけで動き、画面で「保存できない」と知らせる
