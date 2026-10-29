import type { StockConfig } from '../../core/stock'

/**
 * ネコ・グリコの売上カウンター（ネコとグリコの両方の店で使う）。開店時に在庫を記録し、閉店時などに残数を数え直して、減った分を売上にする。
 * 弓道と手裏剣は売上を分けて出す。値上げなどは prices の default を直してデプロイする。id は保存のキーなので変えない
 */
export const neko: StockConfig = {
  id: 'neko',
  title: 'ネコ・グリコ売上カウンター',
  dayStartHour: 4,
  // お札と 500円玉・100円玉だけを受け取る（タクミと同じ）。見出しごとのレジ精算の欄になる
  cash: { bills: [10000, 5000, 1000], coins: [500, 100], bundle: 10000 },
  prices: [
    { id: 'sticker', label: 'ステッカー', default: 1000 },
    { id: 'ema', label: '絵馬', default: 500 },
    { id: 'tegata', label: '手形', default: 500 },
  ],
  sections: [
    {
      id: 'kyudo',
      title: '弓道',
      items: [
        { id: 'kyudo-sticker', name: 'ステッカー', priceId: 'sticker' },
        { id: 'kyudo-ema', name: '絵馬', priceId: 'ema' },
        { id: 'kyudo-tegata', name: '手形', priceId: 'tegata' },
      ],
    },
    {
      id: 'shuriken',
      title: '手裏剣',
      items: [
        { id: 'shuriken-sticker', name: 'ステッカー', priceId: 'sticker' },
        { id: 'shuriken-ema', name: '絵馬', priceId: 'ema' },
        { id: 'shuriken-tegata', name: '手形', priceId: 'tegata' },
      ],
    },
  ],
}
