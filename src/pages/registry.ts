import { neko } from './neko/config'
import { takumi } from './takumi/config'

/** ポータルに並べるページ。ページを足したらここにも1行足す（docs/adding-a-page.md） */
export type PageEntry = {
  /** src/pages からのフォルダ名。URL の一部になる（例: 'takumi' → /takumi/） */
  path: string
  title: string
  description: string
}

export const pages: PageEntry[] = [
  { path: 'takumi', title: takumi.title, description: '串・ホタテ・ビール・ソフトクリームの売上を数えて、報告文をコピー' },
  { path: 'neko', title: neko.title, description: '弓道・手裏剣のステッカー・絵馬・手形を、在庫と残数から売上に' },
]
