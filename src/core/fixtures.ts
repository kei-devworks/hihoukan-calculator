import type { TallyConfig } from './tally'

/** テスト用の設定。値段で呼ぶ品目・名前のある品目・単価を共有する品目をひととおり含む */
export const sampleConfig: TallyConfig = {
  id: 'sample',
  title: 'テスト売上',
  reportTitle: '売上報告',
  dayStartHour: 4,
  prices: [
    { id: 'a', label: '串A', default: 1000 },
    { id: 'b', label: '串B', default: 2000 },
    { id: 'hotate', label: 'ホタテ', default: 1000 },
    { id: 'soft', label: 'ソフト（共通）', default: 800 },
  ],
  sections: [
    {
      id: 'meat',
      title: '◾️肉',
      items: [
        { id: 'a', priceId: 'a' },
        { id: 'b', priceId: 'b' },
        { id: 'hotate', name: 'ホタテ', priceId: 'hotate' },
      ],
    },
    {
      id: 'soft',
      title: '◾️ソフト',
      items: [
        { id: 'vanilla', name: 'バニラ', priceId: 'soft' },
        { id: 'matcha', name: '抹茶', priceId: 'soft' },
      ],
    },
  ],
}
