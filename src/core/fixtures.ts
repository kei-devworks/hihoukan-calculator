import type { StockConfig } from './stock'
import { initialState, type TallyConfig, type TallyState } from './tally'

/** テスト用の「在庫の差」の設定。2つの見出しで単価を共有する */
export const sampleStockConfig: StockConfig = {
  id: 'sample-stock',
  title: 'テスト在庫',
  dayStartHour: 4,
  cash: { bills: [10000, 5000, 1000], coins: [500, 100] },
  prices: [
    { id: 'sticker', label: 'ステッカー', default: 1000 },
    { id: 'ema', label: '絵馬', default: 500 },
  ],
  sections: [
    {
      id: 'a',
      title: 'A',
      items: [
        { id: 'a-sticker', name: 'ステッカー', priceId: 'sticker' },
        { id: 'a-ema', name: '絵馬', priceId: 'ema' },
      ],
    },
    {
      id: 'b',
      title: 'B',
      items: [
        { id: 'b-sticker', name: 'ステッカー', priceId: 'sticker' },
        { id: 'b-ema', name: '絵馬', priceId: 'ema' },
      ],
    },
  ],
}

/** テスト用の設定。値段で呼ぶ品目・名前のある品目・単価を共有する品目をひととおり含む */
export const sampleConfig: TallyConfig = {
  id: 'sample',
  title: 'テスト売上',
  reportTitle: '売上報告',
  reportSectionMark: '◾️',
  dayStartHour: 4,
  // 釣り銭準備金に 1万円の束を使う（在庫の差のテスト用の設定は束なし）
  cash: { bills: [10000, 5000, 1000], coins: [500, 100], bundle: 10000 },
  prices: [
    { id: 'a', label: '串A', default: 1000 },
    { id: 'b', label: '串B', default: 2000 },
    { id: 'hotate', label: 'ホタテ', default: 1000 },
    { id: 'soft', label: 'ソフト（共通）', default: 800 },
  ],
  // 会計のレシート。値段の範囲・1品だけ・名前のある品目のジャンルをひととおり。抹茶はどのジャンルにも入れない
  receipt: [
    { en: 'Wagyu A5', ja: 'A5和牛', section: 'meat', minPrice: 1000, maxPrice: 3000 },
    { en: 'Scallop', ja: 'ホタテ', item: 'hotate' },
    { en: 'Cremia Soft Serve', ja: 'クレミア ソフトクリーム', items: { vanilla: 'Vanilla' } },
  ],
  sections: [
    {
      id: 'meat',
      title: '肉',
      items: [
        { id: 'a', priceId: 'a' },
        { id: 'b', priceId: 'b' },
        { id: 'hotate', name: 'ホタテ', priceId: 'hotate' },
      ],
    },
    {
      id: 'soft',
      title: 'ソフト',
      items: [
        { id: 'vanilla', name: 'バニラ', priceId: 'soft' },
        { id: 'matcha', name: '抹茶', priceId: 'soft' },
      ],
    },
  ],
}

/** テスト用: 品目 id → 個数 を、1件の閉じたオーダーにした状態（個数・合計・報告文だけを見るテスト向け） */
export function stateWithCounts(counts: Record<string, number>, at: Date): TallyState {
  const iso = at.toISOString()
  const lines = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
  if (Object.keys(lines).length === 0) return initialState()
  return {
    ...initialState(),
    orders: [
      { id: 1, kind: 'order', openedAt: iso, lastAt: iso, closedAt: iso, lines, tenders: [], edits: [], cancelledAt: null, source: null },
    ],
    updatedAt: iso,
  }
}
