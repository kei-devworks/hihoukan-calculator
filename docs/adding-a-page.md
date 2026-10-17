# 集計ページを足す

ページは `src/pages/<名前>/` のフォルダ1つ。`index.html` を置けばビルドの入口になり、
`https://kei-devworks.github.io/hihoukan-calculator/<名前>/` で開ける（`vite.config.ts` の設定は変えなくてよい）。

## 「個数 × 単価」のページ（売上カウンターと同じ形）

品目・単価・見出しを設定に書くだけで作れる。例として `src/pages/kiosk/` を作る場合:

### 1. 設定 `src/pages/kiosk/config.ts`

```ts
import type { TallyConfig } from '../../core/tally'

export const kiosk: TallyConfig = {
  id: 'kiosk',               // 保存のキー。公開したら変えない
  title: '売店売上カウンター',
  reportTitle: '売上報告',
  dayStartHour: 4,
  prices: [
    { id: 'postcard', label: 'ポストカード', default: 300 },
    { id: 'tenugui', label: '手ぬぐい', default: 1200 },
  ],
  sections: [
    {
      id: 'goods',
      title: '◾️グッズ',
      items: [
        { id: 'postcard', name: 'ポストカード', priceId: 'postcard' },
        { id: 'tenugui', name: '手ぬぐい', priceId: 'tenugui' },
      ],
    },
  ],
}
```

- `name` を省くと、値段そのものが品目名になる（「1,000円」、報告文は「1,000×3」）
- 複数の品目で同じ `priceId` を使うと、単価を共有できる（ソフトクリームの味違いなど）
- id には英小文字・数字・`-` だけを使う。**公開したあとは id を変えない**（保存済みの数が読めなくなる）。
  `x-` で始まる id は使わない（画面で足した品目に使う）
- `cash: { bills: [10000, 5000, 1000], coins: [500, 100] }` のように受け取るお金の額面を書くと、会計（預かりのボタンとお釣り）を出す。書かなければ出さない

### 2. 入口 `src/pages/kiosk/main.ts`

```ts
import '../../ui/base.css'
import { byId } from '../../ui/dom'
import { mountTallyApp } from '../../ui/tally-app'
import { kiosk } from './config'

mountTallyApp(byId('app'), kiosk)
```

### 3. HTML `src/pages/kiosk/index.html`

`src/pages/takumi/index.html` を写して、`<title>` だけ変える。
`<meta name="robots" content="noindex, nofollow" />`（検索に出さない）とアイコンの行は消さない（消すとテストが落ちる。docs/deployment.md）。

### 4. ポータルに載せる `src/pages/registry.ts`

```ts
import { kiosk } from './kiosk/config'

export const pages: PageEntry[] = [
  // …
  { path: 'kiosk', title: kiosk.title, description: 'ポストカード・手ぬぐいの売上' },
]
```

### 5. テスト

- 設定の書き間違い（id の重複・存在しない単価など）は、`src/pages/registry.test.ts` が
  `src/pages/*/config.ts` を全部拾って検証するので、書き足さなくてよい
- 報告文の形を固定したいときは、`src/pages/takumi/config.test.ts` を写して期待する定型文を書く
- 画面の操作は `e2e/takumi.spec.ts` を参考に E2E を足す

報告文の形がちがうページ（見出しや合計の書き方がちがう）は、`src/core/report.ts` に関数を足し、
`TallyConfig` に報告文の作り方を選べる項目を足す。そのときは `docs/architecture.md` も直す。

## 「在庫の差」のページ（ネコ・グリコと同じ形）

開店時の在庫・途中の追加・残数を数字で入れ、減った分を売上にするページ。設定の形は「個数 × 単価」と同じで、
`reportTitle` がないだけ。見出し（`sections`）ごとに売上が分かれて出る。手順は上と同じで、ちがうのは次の2つ。

```ts
// config.ts
import type { StockConfig } from '../../core/stock'

export const kiosk: StockConfig = {
  id: 'kiosk',
  title: '売店在庫カウンター',
  dayStartHour: 4,
  prices: [{ id: 'postcard', label: 'ポストカード', default: 300 }],
  sections: [{ id: 'goods', title: 'グッズ', items: [{ id: 'goods-postcard', name: 'ポストカード', priceId: 'postcard' }] }],
}
```

```ts
// main.ts
import '../../ui/base.css'
import { byId } from '../../ui/dom'
import { mountStockApp } from '../../ui/stock-app'
import { kiosk } from './config'

mountStockApp(byId('app'), kiosk)
```

- 同じ品物を見出しごとに分けるときは、品目の id を `<見出し>-<品物>` にして重複させない（例: `kyudo-sticker`・`shuriken-sticker`）
- テストは `src/pages/neko/config.test.ts` と `e2e/neko.spec.ts` を参考にする

## 新しい種類のページ

例: レジ締めの金種計算など、既存の種類に当てはまらないもの。勤務時間報告（`src/pages/kinmu/`、
`src/core/work-report.ts`・`src/ui/work-report-app.ts`）がこの作り方の見本になる。

- `src/pages/<名前>/` に `index.html` と `main.ts` を置き、画面は自由に作る
- 品目・単価・見出しがあるなら、設定は `Catalog`（`src/core/catalog.ts`）の形にする。書き間違いのテストが自動で付く
- 共通の部品を使う（[architecture.md](architecture.md) の「ページの共通部分」）
  - 保存: `JsonStore`（`src/core/json-store.ts`）。キーは `storageKey('<名前>', 1)`（`hihoukan-calc:` で始まる）。
    読み戻しの `parse` は、壊れた値でも例外にせず使える形に直す
  - 画面: `pageHeader` / `pageStatus` / `keepFresh`（`src/ui/page-parts.ts`）で、見出し・保存の状態・前日の知らせ・再描画をそろえる
    （前日の知らせが要らないページは、`pageStatus` の `carriedText` / `carriedActions` を省く）
  - 報告文の全角スペースは `　` で書く（ソースに直接書くと ESLint に止められる。コメントの中は書いてよい）
  - 金額は `src/core/format.ts`、コピーは `src/ui/clipboard.ts`、2回押しのボタンは `src/ui/confirm-button.ts`
- 計算は `src/core/` に DOM を使わない関数として書き、単体テストを付ける
- **端末をまたいだ共有やログインが要るなら、作る前に相談する**（GitHub Pages ではできない。[deployment.md](deployment.md)）

## チェックリスト

- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run test:e2e`
- [ ] ポータル（`registry.ts`）に載せた
- [ ] `docs/usage.md` に使い方を書いた（ページごとに節を足す）
