import {
  BUNDLE,
  compareCash,
  countsAmount,
  denominations,
  floatKeys,
  sameAmountNames,
  setCashCount,
  setFloatUsed,
  settle,
  type CashConfig,
  type CashCount,
  type CashField,
} from '../core/cash'
import { formatNumber, formatPrice } from '../core/format'
import { h } from './dom'
import { numberInput } from './number-input'

export type CashPanelOptions = {
  cash: CashConfig
  /** 要素の id の頭（1つのページに複数置くときに分ける） */
  idPrefix: string
  /** 見出し（省略すると「レジ精算」） */
  title?: string
  /** 欄の読み上げ名の頭（1つのページに複数置くときに分ける。例: '弓道 '） */
  labelPrefix?: string
  /** 比べる相手の名前（「注文から出した売上」「在庫から出した売上」） */
  expectedLabel: string
  /** 差が出たときに添える言葉 */
  hints: { over: string; under: string }
  onChange: (next: CashCount) => void
  /** 計算の下に置くもの（ネコ・グリコの［精算を完了する］など）。枚数を消すのはページのリセットだけにする */
  footer?: HTMLElement
}

export type CashPanel = {
  element: HTMLElement
  /** candidates: 差と同じ額の品目を探すための、品目の名前と単価 */
  render: (count: CashCount, expected: number, candidates: readonly { name: string; price: number }[]) => void
}

/** 「10,000円札」「5,000円札」「1,000円札」「500円玉」 */
export function denominationName(denomination: number, coin: boolean): string {
  return `${formatNumber(denomination)}円${coin ? '玉' : '札'}`
}

/** 入力欄の文字を数に読む。空なら null、0 以上の整数でなければ undefined（受け付けない） */
function readCount(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

// 売上バッグと、その中に入れる釣り銭準備金の袋・コインケースの絵（色と絵で見分けられるように）
const BAG_ICON =
  '<svg viewBox="0 0 24 24"><path d="M8 8V6a4 4 0 0 1 8 0v2"/><rect x="3.5" y="8" width="17" height="12.5" rx="2.5"/></svg>'
const POUCH_ICON =
  '<svg viewBox="0 0 24 24"><path d="M7 7.5h10"/><path d="M8.5 7.5 6 18a2.5 2.5 0 0 0 2.4 3h7.2a2.5 2.5 0 0 0 2.4-3L15.5 7.5"/><path d="M9 4.5c1 1.5 5 1.5 6 0"/></svg>'
const COIN_ICON =
  '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/></svg>'

function icon(svg: string): HTMLElement {
  const el = h('span', { class: 'cash-icon', 'aria-hidden': 'true' })
  el.innerHTML = svg
  return el
}

/**
 * レジ精算の画面。初めての人でも迷わないよう、上から順に進む:
 * - 開店時の釣り銭準備金（釣り銭準備金の袋の 1万円の束・コインケースの硬貨。端末が覚える）
 * - ① 釣り銭準備金を、お釣りに使った？［使っていない］［使った］
 * - ② 使っていない: 売上バッグだけ数える。使った: 釣り銭準備金（開店時の数が入っていて、変わったところだけ直す）＋ 売上バッグ
 * - 結果の筆算（数えたお金の合計 − 開店時の釣り銭準備金 → お金から出した売上 − 数えた売上（expectedLabel）→ 差）
 * 名前は略さない（「袋」「バッグ」だけでは初めての人にわからないため）
 */
export function cashPanel(options: CashPanelOptions): CashPanel {
  const { cash, idPrefix } = options
  const prefix = options.labelPrefix ?? ''
  const coins = new Set(cash.coins)
  const money = denominations(cash)
  const keys = floatKeys(cash)
  const bundleName = cash.bundle && cash.bundle % 10000 === 0 ? `${cash.bundle / 10000}万円の束` : `${formatNumber(cash.bundle ?? 0)}円の束`
  const nameOf = (key: string) => (key === BUNDLE ? bundleName : denominationName(Number(key), coins.has(Number(key))))
  const unitOf = (key: string) => (key === BUNDLE ? '束' : '枚')
  const countWord = (key: string) => (key === BUNDLE ? '数' : '枚数')
  // 1万円の束は釣り銭準備金の袋、硬貨はコインケースに入れる
  const POUCH = '釣り銭準備金の袋'
  const CASE = 'コインケース'
  const placeOf = (key: string) => (key === BUNDLE ? POUCH : CASE)
  const places = cash.bundle ? [POUCH, CASE] : [CASE]

  type Field = { field: CashField; key: string; input: HTMLInputElement }
  const fields: Field[] = []
  const makeInput = (field: CashField, key: string, label: string) => {
    const input = numberInput({ id: `${idPrefix}-${field}-${key}`, 'aria-label': label, enterkeyhint: 'next' })
    fields.push({ field, key, input })
    return input
  }
  const place = <T extends HTMLElement>(el: T, row: number | null, column: number | null): T => {
    el.style.gridRow = row === null ? '' : String(row)
    el.style.gridColumn = column === null ? '' : String(column)
    return el
  }
  const stepNo = (n: string) => h('span', { class: 'cash-step-n', 'aria-hidden': 'true', text: n })

  // ---- 開店時の釣り銭準備金（黄の囲み） ----
  const startTotal = h('b', { class: 'cash-block-total' })
  const startAmounts = new Map<string, HTMLElement>()
  const startBlock = h('div', { class: 'cash-float' }, [
    h('p', { class: 'cash-block-h' }, [h('span', { text: '開店時の釣り銭準備金' }), startTotal]),
    h('p', { class: 'cash-one', text: '開店時に用意したお金。毎日同じなら、そのままでOK' }),
    ...places.flatMap((where) => [
      h('p', { class: 'cash-where' }, [icon(where === POUCH ? POUCH_ICON : COIN_ICON), where]),
      h(
        'div',
        { class: 'cash-grid' },
        keys
          .filter((key) => placeOf(key) === where)
          .flatMap((key) => {
            const input = makeInput('floatStart', key, `${prefix}開店時の釣り銭準備金 ${where}の${nameOf(key)}の${countWord(key)}`)
            const amount = h('span', { class: 'cash-yen' })
            startAmounts.set(key, amount)
            return [h('label', { for: input.id, text: nameOf(key) }), input, h('span', { class: 'cash-unit', text: unitOf(key) }), amount]
          }),
      ),
    ]),
  ])

  // ---- ① 釣り銭準備金を、お釣りに使った？ ----
  const usedButtons = ([false, true] as const).map((used) => {
    const button = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', text: used ? '使った' : '使っていない' })
    button.addEventListener('click', () => current && options.onChange(setFloatUsed(current, used)))
    return button
  })
  const usedStep = h('div', { class: 'cash-step' }, [
    h('p', { class: 'cash-step-h' }, [stepNo('1'), '釣り銭準備金を、お釣りに使った？']),
    h('div', { class: 'cash-seg', role: 'radiogroup', 'aria-label': `${prefix}釣り銭準備金をお釣りに使ったか` }, usedButtons),
    h('p', { class: 'cash-one', text: 'コインケースの硬貨を出したら［使った］。わからないときも［使った］' }),
  ])

  // ---- ② 数える（青の囲み = 売上バッグ） ----
  const bagInputs = new Map(money.map((d) => [d, makeInput('bag', String(d), `${prefix}売上バッグ ${denominationName(d, coins.has(d))}の枚数`)]))
  const floatInputs = new Map(
    keys.map((key) => [key, makeInput('floatNow', key, `${prefix}いまの釣り銭準備金 ${placeOf(key)}の${nameOf(key)}の${countWord(key)}`)]),
  )
  for (const input of floatInputs.values()) input.classList.add('float')
  const bagAmounts = new Map(money.map((d) => [d, h('span', { class: 'cash-yen' })]))
  const countTitle = h('span')
  const countRules = h('div', { class: 'cash-rules' })
  const countGrid = h('div')
  const changedLine = h('p', { class: 'cash-changed' })
  const sumLabel = h('span')
  const sumTotal = h('b')
  const sumFloat = h('span')
  const sumBag = h('span')
  const sumSub = h('div', { class: 'cash-sum-sub' }, [h('span', { text: '釣り銭準備金' }), sumFloat, h('span', { text: '売上バッグ' }), sumBag])
  const floatMissing = h('p', { class: 'cash-verdict warn', text: '開店時の釣り銭準備金が入っていません。上の欄に入れてください。' })
  const countStep = h('div', { class: 'cash-step cash-bag' }, [
    h('p', { class: 'cash-step-h' }, [stepNo('2'), icon(BAG_ICON), countTitle]),
    countRules,
    countGrid,
    changedLine,
    h('p', { class: 'cash-sum' }, [sumLabel, sumTotal]),
    sumSub,
    floatMissing,
  ])
  const chip = (cls: string, text: string) => h('span', { class: `cash-chip ${cls}`, text })
  /** 使ったかで欄の並べ方を変える（使ったときは「釣り銭準備金 ＋ 売上バッグ」の2列） */
  let laidOut: boolean | null = null
  const layout = (used: boolean) => {
    if (laidOut === used) return
    laidOut = used
    countTitle.textContent = used ? '売上バッグと釣り銭準備金を数える' : '売上バッグを数える'
    countRules.replaceChildren(
      ...(used
        ? [
            h('p', { class: 'cash-rule' }, [
              chip('float', '釣り銭準備金'),
              ` は、開店時の数が入っています。${places.join('と')}を見て、`,
              h('b', { text: '変わったところだけ直す' }),
            ]),
            h('p', { class: 'cash-rule' }, [
              chip('bag', '売上バッグ'),
              ' は、',
              h('b', { text: `${places.join('・')}に入っていない` }),
              'お金を数える',
            ]),
          ]
        : [h('p', { class: 'cash-rule' }, [h('b', { text: `${places.join('と')}のお金は数えない` })])]),
    )
    if (!used) {
      countGrid.className = 'cash-grid'
      countGrid.replaceChildren(
        ...money.flatMap((d) => {
          const input = place(bagInputs.get(d)!, null, null)
          return [h('label', { for: input.id, text: denominationName(d, coins.has(d)) }), input, h('span', { class: 'cash-unit', text: '枚' }), bagAmounts.get(d)!]
        }),
      )
      return
    }
    // 見た目は額面ごとに「釣り銭準備金 ＋ 売上バッグ」を横に並べるが、欄の HTML の順は列ごとにする
    // （キーボードの「↓」で、釣り銭準備金の束 → 硬貨、売上バッグの 10,000円札 → … → 100円玉 と進む）
    const rows = [...(cash.bundle ? [BUNDLE] : []), ...money.map(String)]
    const row = (key: string) => rows.indexOf(key) + 2
    countGrid.className = 'cash-count-grid'
    countGrid.replaceChildren(
      place(chip('float', '釣り銭準備金'), 1, 2),
      place(chip('bag', '売上バッグ'), 1, 4),
      ...keys.map((key) => place(floatInputs.get(key)!, row(key), 2)),
      ...money.map((d) => place(bagInputs.get(d)!, row(String(d)), 4)),
      ...rows.flatMap((key) => {
        const inFloat = keys.includes(key)
        const inBag = key !== BUNDLE
        return [
          place(h('span', { class: 'cash-name', text: nameOf(key) }), row(key), 1),
          // 入らないところは「—」（欄がないのはまちがいではないとわかるように）
          ...(inFloat ? [] : [place(h('span', { class: 'cash-none', text: '—' }), row(key), 2)]),
          ...(inFloat && inBag ? [place(h('span', { class: 'cash-op', text: '＋' }), row(key), 3)] : []),
          ...(inBag ? [] : [place(h('span', { class: 'cash-none', text: '—' }), row(key), 4)]),
        ]
      }),
    )
  }

  // ---- 結果（筆算: 「−」は左の列に置き、名前の書き出しと金額の右端をそろえる。答えの行だけ太く） ----
  const calc = h('div', { class: 'cash-calc' })
  const verdict = h('p', { class: 'cash-verdict', 'aria-live': 'polite' })
  const resultStep = h('div', { class: 'cash-step' }, [h('p', { class: 'cash-step-h', text: '結果' }), calc, verdict])

  const element = h('section', { class: 'card cash', 'aria-labelledby': `${idPrefix}-title` }, [
    h('h2', { id: `${idPrefix}-title`, text: options.title ?? 'レジ精算' }),
    startBlock,
    usedStep,
    countStep,
    resultStep,
    ...(options.footer ? [options.footer] : []),
  ])

  /** 欄に出す数。いまの釣り銭準備金は、入れていなければ開店時の数 */
  const shown = (count: CashCount, field: CashField, key: string) => {
    const n = field === 'floatNow' ? (count.floatNow[key] ?? count.floatStart[key]) : count[field][key]
    return n === undefined ? '' : String(n)
  }
  let current: CashCount | null = null
  for (const { field, key, input } of fields) {
    input.addEventListener('input', () => {
      const value = readCount(input.value)
      if (value === undefined || !current) return
      options.onChange(setCashCount(current, field, key, value))
    })
    // 受け付けない値（負の数・小数）を打っていたら、欄から離れたときに記録どおりに戻す
    input.addEventListener('blur', () => {
      if (current) input.value = shown(current, field, key)
    })
  }

  function render(count: CashCount, expected: number, candidates: readonly { name: string; price: number }[]) {
    current = count
    const s = settle(count, cash)
    const used = count.floatUsed
    usedButtons.forEach((b, i) => b.setAttribute('aria-checked', String(used === (i === 1))))
    countStep.hidden = used === null
    resultStep.hidden = used === null
    if (used !== null) layout(used)

    for (const { field, key, input } of fields) {
      // 入力中の欄は書き換えない（打っている途中の値を消さないように）
      if (document.activeElement !== input) input.value = shown(count, field, key)
    }
    for (const [key, el] of startAmounts) el.textContent = formatPrice(countsAmount({ [key]: count.floatStart[key] ?? 0 }, cash))
    for (const [d, el] of bagAmounts) el.textContent = formatPrice(d * (count.bag[String(d)] ?? 0))
    startTotal.textContent = formatPrice(s.floatStart)

    changedLine.hidden = s.changed.length === 0
    changedLine.textContent = `釣り銭準備金で直したところ: ${s.changed.map((c) => `${nameOf(c.key)} ${c.from}→${c.to}${unitOf(c.key)}`).join('・')}`
    sumLabel.textContent = used ? '数えたお金の合計' : '売上バッグの合計'
    sumTotal.textContent = formatPrice(s.total)
    sumSub.hidden = !used
    sumFloat.textContent = formatPrice(s.floatNow)
    sumBag.textContent = formatPrice(s.bag)
    floatMissing.hidden = !(used && s.floatStart === 0)

    const result = compareCash(s, expected)
    // 差 = お金から出した売上 − 数えた売上。売上バッグを数えるまでは出さない
    const diff =
      result.kind === 'none'
        ? '—'
        : result.kind === 'match'
          ? formatPrice(0)
          : `${result.kind === 'over' ? '＋' : '−'}${formatPrice(result.amount)}`
    const tone = result.kind === 'match' ? 'ok' : result.kind === 'none' ? 'none' : 'warn'
    const line = (op: string, label: (Node | string)[], amount: string, strong = false) => [
      h('span', { class: 'cash-calc-op', text: op }),
      h(strong ? 'b' : 'span', {}, label),
      h(strong ? 'b' : 'span', { class: strong ? 'cash-calc-yen cash-sales' : 'cash-calc-yen', text: amount }),
    ]
    const rule = () => h('span', { class: 'cash-calc-rule', 'aria-hidden': 'true' })
    const diffCell = h('b', { class: 'cash-calc-yen cash-diff', 'data-tone': tone, text: diff })
    calc.replaceChildren(
      ...(used
        ? [
            ...line('', ['数えたお金の合計'], formatPrice(s.total)),
            ...line('−', ['開店時の釣り銭準備金'], formatPrice(s.floatStart)),
            rule(),
            ...line('', ['お金から出した売上'], formatPrice(s.sales), true),
          ]
        : line('', ['お金から出した売上', h('small', { class: 'cash-calc-sub', text: '売上バッグの合計' })], formatPrice(s.sales), true)),
      ...line('−', [options.expectedLabel], formatPrice(expected)),
      rule(),
      h('span', { class: 'cash-calc-op' }),
      h('b', { text: '差' }),
      diffCell,
    )

    const same = (amount: number) => {
      const names = sameAmountNames(amount, candidates)
      return names.length > 0 ? `（${names.join('・')} 1つ分と同じ額）` : ''
    }
    verdict.className = `cash-verdict ${tone}`
    verdict.textContent =
      result.kind === 'none'
        ? `売上バッグの枚数を入れると、${options.expectedLabel}と比べます。`
        : result.kind === 'match'
          ? 'ぴったり合っています。'
          : result.kind === 'over'
            ? `お金のほうが ${formatPrice(result.amount)} 多い。${options.hints.over}${same(result.amount)}。`
            : `お金のほうが ${formatPrice(result.amount)} 少ない。${options.hints.under}${same(result.amount)}。`
  }

  return { element, render }
}
