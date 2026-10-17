# 設計

## 全体像

- サーバーのない静的サイト。GitHub Pages に置く（[deployment.md](deployment.md)）
- 1ページ = 1つの集計ツール。ページは `src/pages/<名前>/` に置き、ポータル（`src/pages/index.html`）から開く。
  ポータルの右上の［共有］で、入口のリンクを QR・共有シート・コピーで渡せる（`ui/share-dialog.ts`）
- ページの種類は3つ。どれも設定を書くだけで作れる

  | 種類 | やること | 例 |
  | --- | --- | --- |
  | 個数 × 単価（tally） | 売れるたびに＋/− で数える。報告文をコピーする | タクミ（`takumi/`） |
  | 在庫の差（stock） | 開店時・追加・残数を数字で入れ、減った分を売上にする | ネコ・グリコ（`neko/`） |
  | 勤務時間報告（work-report） | 勤務日・勤務時間・交通費から報告文を作ってコピーする | 勤務時間報告（`kinmu/`） |

- 数字は**各端末のブラウザ（localStorage）にだけ**保存する。端末どうしで共有はしない

## ディレクトリ

```
src/
  core/          DOM に触れないロジック。単体テストの中心
    catalog.ts     品目・単価・見出しの設定（Catalog）の型と検証。売上を数えるページ共通の土台
    tally.ts       「個数 × 単価」の計算・保存値の読み戻し
    tally-store.ts TallyState を端末に保存・復元する
    orders.ts      オーダーの記録と増減（＋/−・閉じる・直す・取り消す・元に戻す）
    hourly.ts      オーダーを1時間ごとにまとめる（記録と推移）
    checkout.ts    会計の預かりとお釣り
    cash.ts        お金の額面の設定（会計のボタン・レジ精算の欄）
    report.ts      売上報告の定型文
    stock.ts       「在庫の差」の記録・計算・保存値の読み戻し
    stock-store.ts StockState を端末に保存・復元する
    work-report.ts 勤務時間報告の文面・記録・次の報告の初期値・保存値の読み戻し
    work-report-store.ts  WorkReportState を端末に保存・復元する
    json-store.ts  1ページ分の状態を JSON で保存・復元する（JsonStore。各ページの store の土台）
    storage.ts     localStorage の薄い包み（キーの接頭辞・例外を投げない読み書き）
    guards.ts      保存値を読み戻すときの型の確かめ
    time.ts        報告時刻・営業日・日時の表示
    format.ts      金額の表示
    qr.ts          QR コードの点の並び（qrcode-generator は使うときだけ読み込む）
  ui/            DOM の共通部品と共通スタイル
    page-parts.ts  ページ共通の部品: 見出し、保存の状態、前の営業日の知らせ、表示を新しく保つしくみ
    tally-app.ts   TallyConfig から「個数 × 単価」の画面を組み立てる（mountTallyApp）
    tally.css      その画面だけのスタイル
    stock-app.ts   StockConfig から「在庫の差」の画面を組み立てる（mountStockApp）
    stock.css      その画面だけのスタイル
    work-report-app.ts  勤務時間報告の画面（mountWorkReportApp）
    work-report.css     その画面だけのスタイル
    base.css       全ページ共通の色・余白・カード・知らせ・ボタン・ポータル
    cash-panel.ts  レジ精算の画面（タクミとネコ・グリコで共通）
    clipboard.ts   コピー（Clipboard API → execCommand → 選択して長押し）
    confirm-button.ts  2回押すと実行するボタン（ネコ・グリコ・勤務時間報告のリセットなど）
    hold-button.ts タップで構えて長押しで実行するボタン（タクミのリセット・取り消しなど）
    dom.ts         要素を作る小さなヘルパー
    qr.ts          QR コードを SVG で描く（いつも白地に黒）
    share-dialog.ts  リンクを QR・共有シート（AirDrop・LINE など）・コピーで渡すダイアログ
  pages/         Vite の入口。1ページ = 1フォルダ
    index.html     ポータル
    registry.ts    ポータルに並べるページの一覧
    takumi/        タクミ売上カウンター（config.ts に品目・単価）
    neko/          ネコ・グリコ売上カウンター（config.ts に品目・単価）
    kinmu/         勤務時間報告（config.ts に初めて使うときの勤務時間）
e2e/             Playwright
public/          そのまま配信するファイル（アイコン: favicon.svg・favicon-32.png・apple-touch-icon.png）
scripts/         開発用のスクリプト（make-icons.mjs: favicon.svg から PNG のアイコンを作る）
```

ページを足す手順は [adding-a-page.md](adding-a-page.md)。

依存の向きは `pages → ui → core` の一方通行。`core` は DOM も `window` も使わない
（`storage.ts` の `openLocalStorage` だけが `window.localStorage` に触れる）。

## ページの共通部分

ページは、どれも次の土台の上に作る（`Catalog` は品目と単価のあるページだけ）。

| 土台 | 中身 |
| --- | --- |
| `Catalog`（`core/catalog.ts`） | ページの id・題名・営業日の切り替わり・単価（`prices`）・見出しごとの品目（`sections`）・受け取るお金の額面（`cash`。書いたときだけ会計とレジ精算を出す）。`validateCatalog` で書き間違いを見つける |
| `JsonStore`（`core/json-store.ts`） | 状態を `hihoukan-calc:<ページの id>:v<版>` に保存・復元する。読み戻しはページごとの `parse` 関数に任せ、壊れた値でも例外にしない |
| `earlierBusinessDay`（`core/time.ts`） | 「数え始めた時刻」が前の営業日かを判定する（前日の数字が残っている知らせに使う） |
| `pageHeader` / `pageStatus` / `keepFresh`（`ui/page-parts.ts`） | 「‹ 一覧」と題名、保存の状態と赤い警告、前の営業日の黄色い知らせ、30秒ごと・画面復帰・別タブ・戻るボタンでの再描画 |
| アイコン（`public/`） | どのページの `<head>` にも、タブのアイコン（射的の的。`favicon.svg` と、SVG を表示できない iOS 26 より前の Safari 向けの `favicon-32.png`）とホーム画面のアイコン（`apple-touch-icon.png`）を書く |

アイコンは `/favicon.svg` のようにサイトの根からのパスで書く。ビルドすると、ページの場所に合わせた相対パス（`takumi/` なら `../favicon.svg`）に直る。
PNG は `favicon.svg` から `node scripts/make-icons.mjs` で作る（SVG を直したら作り直してコミットする）。

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

押した分は、お客さん1組の注文（オーダー）ごとに記録する（`core/orders.ts`）。個数・合計・報告文は、すべてのオーダーから数える。

```ts
type TallyState = {
  orders: Order[]                         // オーダーの記録（古い順）
  priceOverrides: Record<string, number>  // 既定から変えた単価だけ
  cash: {                                 // レジ精算で数えた枚数（額面 → 枚数。設定に cash があるページだけ）
    pocket: Record<string, number>        // 売上のポケット
    floatStart: Record<string, number>    // 硬貨の釣り銭準備金の開店時（リセットでも残す）
    floatNow: Record<string, number>      // 硬貨の釣り銭準備金のいま
  }
  updatedAt: string | null                // 最後に記録を変えた時刻
}
type Order = {
  id: number                              // 1 から増やす
  kind: 'order' | 'handover'              // お客さんのオーダー／まとめて入れた数（更新前の記録など）
  openedAt: string                        // 始めた時刻
  lastAt: string                          // 最後に足した時刻
  closedAt: string | null                 // ［完了］などで閉じた時刻
  lines: Record<string, number>           // 品目 id → 数（0 の品目は持たない）
  tenders: number[]                       // 会計で預かった額面
  edits: { at: string; before: Record<string, number> }[]  // 直したときの、直す前の中身
  cancelledAt: string | null              // 取り消した時刻（数に入れないが、記録には残す）
  source: string | null                   // まとめて入れた数の出どころ
}
```

- ＋（`addItem`）は今のオーダーに足す。今のオーダーは記録のいちばん最後のオーダーで、閉じておらず、
  最後に押してから3分（`ORDER_IDLE_MS`）たっていないもの（`isOpen`）。なければ新しいオーダーを始める
- −（`removeItem`）は、今のオーダーにその品目があればそこから減らす。なければ、その品目がある
  いちばん新しいオーダーから減らし、直した記録（`edits`）を残す。今のオーダーが空になったら消し、
  前のオーダーが空になったら中身を残したまま取り消し済みにする
- 数え始めた時刻（`startedAtOf`）は、取り消していないいちばん古いオーダーの始めた時刻
- 直す（`editOrder`）と、直す前の中身を `edits` に残す。中身を空にして保存すると取り消しになる。
  `revertEdit` で直す前に戻せ、戻したことも `edits` に残る
- 取り消す（`cancelOrder`）と数に入れないが、オーダーは消さずに残す。`restoreOrder` で元に戻せる
- レジ精算（`core/cash.ts`）: 売上のお金 = ポケットの合計 −（準備金の開店時 − いま）（`settle`）。数えた売上と比べ（`compareCash`）、差と同じ単価の品目を添える（`sameAmountNames`）。いまの準備金を数えていない・開店時がない・いまのほうが多いときは知らせ、使った分を 0 にする。`cash` は版 2 のあとから足した項目なので、保存になければ空にする
- 会計の預かりは押した額面の並び（`tenders`）で持つ（`addTender` / `removeTender`）。預かりが合計に届いたオーダー（`isPaid`）は、
  次の ＋（`addItemForCustomer`）で閉じて、次のお客さんのオーダーを始める
- 1時間ごとの推移（`hourlyEntries`）は、オーダーを始めた時刻で分け、件数・売上・その時間の終わりまでの累計を出す。
  まとめて入れた数（引き継ぎ・更新前の記録）は時間の売上に入れず別の行にし、累計には入れる。
  オーダーのない時間は `empty`。引き継ぎと同じ時間か、そのあとオーダーより先に引き継ぎが来る時間は `covered`（押し忘れとみなさない）
- 更新は `addItem` / `removeItem` / `setPrice` / `resetCounts` などの純関数で、新しい状態を返す（元の状態は書き換えない）
- 画面は「状態を変える → `TallyStore.update` で保存 → 描き直す」の順に動く

### 画面（`mountTallyApp`）

設定から行・小計・合計・単価設定・報告文を組み立て、状態が変わるたびに `render()` で表示を合わせる。
見出しの下の切り替えのボタン（`viewTabs`。上に残る）で、画面を「数える」（品目の行・合計・報告文）・「記録」（`tallyLog`）・「品目」（単価設定）に分ける。
開いたときはいつも「数える」。

| 画面の要素 | ふるまい |
| --- | --- |
| ＋ / − | `addItem` / `removeItem` → 保存 → 描き直し。ボタンの読み上げ名は「1,000円を1つ増やす」 |
| 報告時刻 | 初期値はいまに一番近い「ちょうど」。手で変えなければ、30秒ごと・画面に戻ったときにいまの時刻へ合わせ直す（開きっぱなしの端末向け）。「今」で自動に戻る |
| 保存の状態 | 「この端末に保存済み（最終更新 21:03）」。保存できない・失敗したときは赤い知らせ |
| 前の営業日の知らせ | `carriedOverSince` が時刻を返すあいだ出し続け、「0 に戻して今日を始める」（タップして長押し）で消える |
| 単価設定 | 入力のたびに `setPrice`。欄が空の間は変えず、欄から離れると今の単価に戻す。変えた単価には既定値を並べ、見出しに件数を出す |
| コピー | Clipboard API → execCommand。どちらもだめなら報告文を選択して「長押しでコピー」と出す |
| リセット | タップで赤い「長押しで全部 0 にする」に変わり、4秒のうちに1秒長押しで実行（`holdButton`）。単価の変更は残す |
| 今のオーダー（`orderPanel`） | 画面の下（`.dock`）に出す。品目ごとに「元の数 ＋このオーダーの数 → 今日の数」と −/＋、［完了］（`closeOrder`）、［このオーダーを取り消す］（長押し。`cancelOrder`、元に戻せる）。品目の行は3行分の高さでパネルの中をスクロールし、押した品目の行を見えるところまで動かす。閉じたら「前のオーダー … ›」（押すと中身）。「数える」以外の画面では「今のオーダー … ›」だけ出す。3分で閉じる時刻にタイマーで描き直す |
| 会計（`openCheckout`） | 今のオーダー・前のオーダーの［会計］で下から出す（設定に `cash` があるページだけ）。合計、額面のボタン（押すたびに `addTender`）、預かりと内訳、［1つ戻す］［0に戻す］（`removeTender`）、お釣り（`changeDue`）。［完了］で閉じる。預かりはパネルと記録にも出す |
| レジ精算（`cashPanel`） | ［レジ精算］の画面。売上のポケットの枚数、準備金の開店時・いまを横に並べた欄、［使っていない］、レシートのような計算、カウンターの合計（`grandTotal`）との比べ、［数え直す］（長押し）。タクミとネコ・グリコで同じ部品を使う |
| オーダーの編集（`openOrderEditor`） | 前のオーダーの［編集］で、下から出すダイアログ。品目ごとの −/＋ と［＋ 品目を足す］で下書きを変え、［変更を保存］で `editOrder`（知らせから元に戻せる）。変更の記録（`editSteps`）ごとに［この変更の前に戻す］（`revertEdit`）。取り消しは長押し |
| 記録（`tallyLog`） | オーダーの数・最後の記録の時刻、`hourlyEntries` の時間ごとの行（件数・売上・横棒・累計。記録なしは黄色、引き継ぎは別の行）。時間の行（details）を開くと、オーダーが新しい順に「時刻 | 品目 | 金額」「点数・変更の回数 | ［編集］」の2段で並ぶ。取り消し済みは線を引いて［元に戻す］。開いた時間は描き直しても開いたまま。開いているときだけ描く |
| お知らせ（`noticeBar`） | 画面の下に固定して出す（`.dock`）。リセットのあとと、− で前のオーダーから減らしたときに［元に戻す］つきで3分出す。戻す先は変える前の状態なので、ほかの操作をしたとき・別のタブで変わったときは消す |

ほかに、同じ端末の別のタブで数字が変わったら（`storage` イベント）、戻るボタンでキャッシュから表示されたら（`pageshow`）、保存を読み直す。

## 「在庫の差」の集計（stock）

ネコ・グリコのように「開店時に在庫を記録し、あとで残数を数え直して、減った分を売上にする」ページ。
設定（`StockConfig`）は `Catalog` そのもので、見出し（弓道・手裏剣）ごとに売上を分けて出す。定型文はない。

```ts
const config: StockConfig = {
  id: 'neko',
  title: 'ネコ・グリコ売上カウンター',
  dayStartHour: 4,
  prices: [{ id: 'sticker', label: 'ステッカー', default: 1000 } /* … */],
  sections: [
    { id: 'kyudo', title: '弓道', items: [{ id: 'kyudo-sticker', name: 'ステッカー', priceId: 'sticker' } /* … */] },
    { id: 'shuriken', title: '手裏剣', items: [/* … */] },
  ],
}
```

### 状態と計算

```ts
type StockState = {
  entries: Record<string, { start: number | null; added: number | null; remaining: number | null }>
  updatedAt: string | null
  startedAt: string | null   // いまの記録を入れ始めた時刻（前の営業日の判定）
}
```

- **空欄（null）と 0 を区別する。** 残数が空なら「まだ数えていない」、0 なら「売り切れ」
- 売れた数 = 開店時 + 追加（空なら 0）− 残数。売上 = 売れた数 × 単価（`itemResult`）
- 品目ごとの結果は5つ: `empty`（何もない）、`needStart`（開店時が空）、`needRemaining`（残数が空。その時点の在庫を出す）、
  `tooMany`（残数が在庫より多い＝入れまちがい）、`ok`
- 見出しの売上（`sectionResult`）は `ok` の品目だけを足し、計算できない品目の数（入れかけ・要確認）を添える
- 追加は1つの欄に合計を入れる（何回かに分けて足しても、合計を入れれば計算は同じ）
- 次の日の始め方は2つ: `carryRemainingToStart`（前日の残数を今日の開店時に移す）と `resetStock`（全部消す）

### 画面（`mountStockApp`）

| 画面の要素 | ふるまい |
| --- | --- |
| 開店時・追加・残数の欄 | `type="number"`・数字キーボード。入力のたびに `setField` → 保存。空にすると null に戻る。負の数・小数は記録せず、欄から離れると記録どおりに戻す。読み上げ名は「弓道 ステッカー 開店時の在庫」 |
| 品目の結果 | 「売れた 18個 → ￥18,000-」など。直すべき欄（開店時が空・残数が多すぎる）は赤枠 |
| 見出しの売上 | カードの下に小計と、入れかけ・要確認の品目数 |
| 計算結果 | 見出しごとに売上と売れた数を分けて大きく出し、合計は小さく添える |
| 前の営業日の知らせ | 「残数を今日の開店時の在庫にする」「全部消して始める」（どちらも2回押し） |
| リセット | 2回押しで全部の欄を空にする |

単価は画面から変えない（設定を直してデプロイする）。

## 勤務時間報告（work-report）

勤務日・勤務時間・休憩・交通費から報告文を作ってコピーするページ。品目や単価はないので `Catalog` は使わず、
設定（`WorkReportConfig`）はページの id・題名・営業日の切り替わり・初めて使うときの勤務時間だけ。

```
勤務時間報告
10月14日(水曜日)
勤務時間　16:00 〜23:00        ← 全角スペース、「〜」の前だけ半角スペース。時は0埋めしない
休憩時間　0分
交通費　（往復）500円          ← 交通費なしなら「交通費　なし」の1行
　　園田駅〜なんば駅           ← 全角スペース2つ。駅名に「駅」を付けて書く
10月13日分受領済み             ← 日払いで、受領済みの日付があるときだけ
```

全角スペースはソースでは `　` の定数（`ZS`）で書く（見分けにくく、ESLint にも止められるため）。

### 状態

```ts
type WorkReportState = {
  patterns: { id: string; amount: number; from: string; to: string }[]  // 交通費のパターン
  selectedPatternId: string | null    // null なら「交通費なし」
  payMode: 'daily' | 'monthly'
  history: ReportRecord[]             // コピーした報告（勤務日ごとに1件、直近60件）
  draft: ReportDraft | null           // 書きかけ
  updatedAt: string | null
}
type ReportRecord = { workDate: string; start: string; end: string; breakMinutes: number; copiedAt: string }
type ReportDraft = { workDate; start; end; breakMinutes; receivedDate: string | null; receivedEdited: boolean; savedAt: string }
```

- **設定**（パターン・選んだパターン・日払い／月払い）は変えたときにすぐ保存する
- **記録**（`history`）は「コピーして報告する」を押したときに足す（同じ勤務日は差し替え）
- **書きかけ**（`draft`）は入力のたびに保存する。iPhone でほかのアプリに切り替えた間にページが再読み込みされても消えないように

### 次の報告の初期値（`openingDraft`）

- 同じ営業日の書きかけがあれば、それを戻す
- なければ、勤務日は今日の営業日（朝 4 時より前なら前日）、勤務時間・休憩は**最後にコピーした報告**と同じ（初めてなら設定の既定）
- 受領済みの勤務日（`defaultReceivedDate`）は「**選んだ勤務日より前で、いちばん新しい報告の勤務日**」。
  単に「最後にコピーした日」にすると、同じ日の報告をコピーし直したときにその日自身が入ってしまい、
  遅れて前の日の分を報告するときにも合わなくなるため
- 勤務日を変えると受領済みも決め直す。ただし受領済みを手で変えていたら（`receivedEdited`）そのまま
- 報告の記録がなければ受領済みは null で、行を書かない（初めて使うとき）

### 画面（`mountWorkReportApp`）

| 画面の要素 | ふるまい |
| --- | --- |
| 勤務日 | 日付の欄と「‹ 前の日」「今日」「次の日 ›」。下に「10月14日(水曜日)」 |
| 勤務時間 | 開始・終了とも「時」（0〜23）と「分」（5分刻み）のセレクト。iPhone では回転式で選べる。下に実働（日をまたぐ勤務も数える） |
| 休憩 | 0・15・30・45・60・90分のボタンと、分を入れる欄 |
| 交通費 | パターンをラジオボタンで切り替え。「＋ パターンを追加」「編集」で登録・修正・削除（削除は2回押し）。パターンがないときは登録の欄を開いておく |
| 給料の受け取り | 日払い／月払いの切り替え。日払いのときだけ受領済みの勤務日の欄（「消す」で行を書かない） |
| コピーして報告する | 報告文をコピーし（できなければ選択して長押しを案内）、勤務日と勤務時間を記録する |

## 保存

| 項目 | 内容 |
| --- | --- |
| 場所 | ブラウザの `localStorage`（端末 × ブラウザごと） |
| キー | `hihoukan-calc:<ページの id>:v<版>`（例: `hihoukan-calc:takumi:v2`、`hihoukan-calc:neko:v1`、`hihoukan-calc:kinmu:v1`） |
| 中身 | `TallyState` / `StockState` / `WorkReportState` の JSON |
| 書くとき | 個数・単価・欄の数字・設定を変えるたびと、勤務時間報告をコピーしたとき |

```json
{
  "orders": [
    {
      "id": 1, "kind": "order",
      "openedAt": "2026-10-15T12:01:00.000Z", "lastAt": "2026-10-15T12:02:10.000Z", "closedAt": null,
      "lines": { "skewer1": 2, "vanilla": 1 },
      "tenders": [], "edits": [], "cancelledAt": null, "source": null
    }
  ],
  "priceOverrides": {},
  "updatedAt": "2026-10-15T12:02:10.000Z"
}
```

```json
{
  "entries": { "kyudo-sticker": { "start": 20, "added": 10, "remaining": 12 } },
  "updatedAt": "2026-10-15T09:00:00.000Z",
  "startedAt": "2026-10-15T00:55:00.000Z"
}
```

### 決まりごと

- **キーは必ず `hihoukan-calc:` で始める。** `kei-devworks.github.io` の下のサイトは保存場所を共有するため
- **公開したあと、ページ・品目・単価の id は変えない。** 変えると保存済みの数が読めなくなる。名前（`name`・`label`・`title`）は変えてよい
- 保存の形を変えるときは版（`TALLY_STORAGE_VERSION` / `STOCK_STORAGE_VERSION` / `WORK_REPORT_STORAGE_VERSION`）を上げ、古い版を読み替える処理を足す。
  `JsonStore` に古い版のキー（`legacyKeys`）を渡すと、新しいキーに何もなければ古いキーを読み、新しいキーに書けたら古いキーを消す
- タクミは版 2 でオーダーの記録にした。版 1（品目ごとの個数だけ）は、数え始めた時刻の「まとめて入れた数（更新前の記録）」1件に読み替える
- 読み戻し（`parseState` / `parseStockState` / `parseWorkState`）は何が来ても例外にしない。壊れた値・設定から消えた品目・負の数は捨てる

### 設計の判断

- **日付が変わっても自動では消さない。** 深夜まで営業した日に、集計の途中で数字が消えるのを防ぐため。
  前の営業日の数字が残っていれば画面で知らせ、消すのは人が「リセット」を押したときだけ。
  判定は**数え始めた時刻**（`startedAtOf`。ネコ・グリコは `startedAt`）で行う（`carriedOverSince`）。最終更新の時刻で判定すると、
  残った数字に今日の分を1つ足しただけで知らせが消え、前日と今日の数字が混ざるため
- **単価は既定から変えたものだけ保存する。** 値上げなどでコードの既定値を直してデプロイしたとき、
  端末に古い単価が残り続けないようにするため
- **保存できない端末でも動く。** `JsonStore` は storage が使えなければメモリ上だけで動き、画面で「保存できない」と知らせる
- **在庫の差のページは数字を入れる方式にする。** 1日に1〜2回まとめて数えるので、ボタンで1つずつ数えるより
  在庫と残数を打つほうが早い。空欄と 0 を区別し、計算できない品目は売上に入れずに知らせる
- **勤務時間報告は、コピーしたときに記録する。** 「報告した」ことが受領済みの日付の根拠になるため。
  書きかけは別に保存し、同じ営業日のうちだけ戻す（次の日は前回コピーした内容から始める）
