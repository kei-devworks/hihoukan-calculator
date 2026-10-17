import type { TallyConfig } from '../../core/tally'

/**
 * タクミの売上カウンター。1時間ごとに売上報告の定型文をコピーして送る。
 * 値上げなどは prices の default を直してデプロイする。id は保存のキーなので変えない
 */
export const takumi: TallyConfig = {
  id: 'takumi',
  title: 'タクミ売上カウンター',
  reportTitle: '売上報告',
  // 報告文の見出しだけに付ける（「◾️肉」）。画面の見出しは「肉」
  reportSectionMark: '◾️',
  dayStartHour: 4,
  // お札と 500円玉・100円玉だけを受け取る。会計の預かりのボタンになる
  cash: { bills: [10000, 5000, 1000], coins: [500, 100] },
  prices: [
    { id: 'skewer1', label: '串①', default: 1000 },
    { id: 'skewer2', label: '串②', default: 2000 },
    { id: 'skewer3', label: '串③', default: 3000 },
    { id: 'skewer4', label: '串④', default: 5000 },
    { id: 'hotate', label: 'ホタテ', default: 1000 },
    { id: 'beer', label: 'ビール', default: 500 },
    { id: 'soft', label: 'ソフト（共通）', default: 800 },
  ],
  sections: [
    {
      id: 'meat',
      title: '肉',
      items: [
        // 串は値段で呼ぶので名前を付けない（画面は「1,000円」、報告文は「1,000×3」）
        { id: 'skewer1', priceId: 'skewer1' },
        { id: 'skewer2', priceId: 'skewer2' },
        { id: 'skewer3', priceId: 'skewer3' },
        { id: 'skewer4', priceId: 'skewer4' },
        { id: 'hotate', name: 'ホタテ', priceId: 'hotate' },
        { id: 'beer', name: 'ビール', priceId: 'beer' },
      ],
    },
    {
      id: 'soft',
      title: 'ソフト',
      items: [
        { id: 'vanilla', name: 'バニラ', priceId: 'soft' },
        { id: 'mix', name: 'ミックス', priceId: 'soft' },
        { id: 'matcha', name: '抹茶', priceId: 'soft' },
      ],
    },
  ],
}
