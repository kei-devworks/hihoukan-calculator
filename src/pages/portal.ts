import '../ui/base.css'
import { byId, h } from '../ui/dom'
import { openShareDialog } from '../ui/share-dialog'
import { pages } from './registry'

const list = byId<HTMLUListElement>('page-list')

if (pages.length === 0) {
  list.replaceWith(h('p', { class: 'empty', text: 'まだページがありません。' }))
} else {
  for (const page of pages) {
    list.append(
      h('li', {}, [
        h('a', { href: `./${page.path}/` }, [
          h('span', { class: 'title', text: page.title }),
          h('span', { class: 'desc', text: page.description }),
        ]),
      ]),
    )
  }
}

// このサイトの入口を QR・共有シート・コピーで渡す。URL は開いている場所から作る（ローカルの確認でも本番でも同じ）
byId('share-site').addEventListener('click', () => {
  openShareDialog({
    title: 'このサイトを共有',
    url: new URL('./', location.href).href,
    note: 'スマホのカメラで読み取ると、このページが開きます。',
    qrLabel: 'このサイトの入口の QR コード',
  })
})
