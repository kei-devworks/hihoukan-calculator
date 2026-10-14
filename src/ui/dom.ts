/** id で要素を取る。HTML とスクリプトの食い違いはその場で気づけるよう、見つからなければ例外にする */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} が見つかりません`)
  return el as T
}

type Attrs = Record<string, string | number | boolean | undefined>

/**
 * 要素を作る小さなヘルパー。`class` と `text` は特別扱いし、ほかは属性として設定する。
 * 値が false / undefined の属性は付けない
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (key === 'class') el.className = String(value)
    else if (key === 'text') el.textContent = String(value)
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  el.append(...children)
  return el
}
