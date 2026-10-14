import '../ui/base.css'
import { byId, h } from '../ui/dom'
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
