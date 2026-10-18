import { formatPrice } from '../core/format'
import {
  inputFromCode,
  inputFromReport,
  makeHandoverCode,
  planHandover,
  withNewItems,
  type HandoverInput,
  type HandoverMode,
} from '../core/handover'
import { decodeHandoverCode, handoverLink, hasHandoverCode } from '../core/handover-code'
import { pieces } from '../core/orders'
import { displayName, sectionsOf, type Counts, type TallyConfig, type TallyState } from '../core/tally'
import { formatMonthDayTime, formatTime } from '../core/time'
import { copyText } from './clipboard'
import { h } from './dom'
import { holdButton } from './hold-button'
import { numberInput } from './number-input'
import { qrSvg } from './qr'
import { qrScanner } from './qr-scanner'
import { viewTabs } from './view-tabs'

export type HandoverDialogOptions = {
  config: TallyConfig
  state: () => TallyState
  now: () => Date
  /** このページの URL（引き継ぎのリンクの `#` より前） */
  pageUrl: string
  /** ［引き継ぐ］を押したとき（状態を変えて保存し、知らせを出す） */
  receive: (input: HandoverInput, mode: HandoverMode) => void
}

/** 読み込んだ前の人の数。code: QR・リンク、report: 報告文 */
type Loaded = { input: HandoverInput; via: 'code' | 'report' }

/** データの古さ（「5分前」）。12時間より古ければ古いと知らせる */
const STALE_MS = 12 * 60 * 60_000
function age(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000))
  if (minutes < 1) return 'いま'
  if (minutes < 60) return `${minutes}分前`
  return `${Math.floor(minutes / 60)}時間前`
}

/**
 * 引き継ぎの画面（下から開くダイアログ）。［次の人に渡す］で QR とリンクを出し、
 * ［前の人から受け取る］で、ゼロから引き継ぐ・休憩から戻ったを選んで、QR・報告文・打ち込みで前の人の数を入れる。
 * リンク（`#hikitsugi=`）から開いたときは、読み込んだ状態の［前の人から受け取る］で開く（start）
 */
export function openHandoverDialog(options: HandoverDialogOptions, start?: Loaded): HTMLDialogElement {
  const { config } = options
  const title = h('h2', { id: 'handover-title' })
  const backButton = h('button', { type: 'button', class: 'ghost handover-back', text: '‹ 戻る' })
  const body = h('div', { class: 'handover-body' })
  const dialog = h('dialog', { class: 'handover', 'aria-labelledby': 'handover-title' }, [
    h('div', { class: 'editor-head' }, [
      h('div', { class: 'handover-title' }, [backButton, title]),
      h('button', { type: 'button', class: 'ghost editor-x', 'aria-label': '引き継ぎを閉じる', text: '×' }),
    ]),
    body,
  ])
  /** 開いている画面を片づける（カメラを止めるなど） */
  let cleanup = () => {}
  const close = () => {
    cleanup()
    if (typeof dialog.close === 'function' && dialog.open) dialog.close()
    dialog.remove()
  }
  dialog.querySelector('.editor-x')!.addEventListener('click', close)
  dialog.addEventListener('close', () => {
    cleanup()
    dialog.remove()
  })
  backButton.addEventListener('click', () => showMenu())

  const show = (heading: string, content: HTMLElement[], withBack: boolean) => {
    cleanup()
    cleanup = () => {}
    title.textContent = heading
    backButton.hidden = !withBack
    body.replaceChildren(...content)
  }

  // ---- はじめの画面: 渡すか受け取るか ----
  function showMenu() {
    const choice = (label: string, note: string, onClick: () => void) => {
      const button = h('button', { type: 'button', class: 'handover-choice' }, [h('b', { text: label }), h('span', { text: note })])
      button.addEventListener('click', onClick)
      return button
    }
    show(
      '引き継ぎ',
      [
        choice('次の人に渡す', 'この端末の数を QR にして、次の人の端末で読んでもらいます', showSend),
        choice('前の人から受け取る', '前の人の QR を読むか、報告文を貼るか、数を打ち込みます', () => showReceive()),
      ],
      false,
    )
  }

  // ---- 次の人に渡す ----
  function showSend() {
    const state = options.state()
    const now = options.now()
    const code = makeHandoverCode(config, state, now)
    const link = handoverLink(options.pageUrl, code)
    const qrBox = h('div', { class: 'qr-box', text: 'QR コードを作っています…' })
    qrSvg(link, '引き継ぎの QR コード').then(
      (svg) => qrBox.replaceChildren(svg),
      () => (qrBox.textContent = 'QR コードを作れませんでした。下のボタンでリンクを送ってください。'),
    )
    const buttons: HTMLElement[] = []
    if (typeof navigator.share === 'function') {
      const share = h('button', { type: 'button', class: 'ghost', text: 'AirDrop・LINE などで送る' })
      // 共有シートを閉じただけのとき（AbortError）も含め、失敗しても何もしない
      share.addEventListener('click', () => navigator.share({ title: `${config.title}の引き継ぎ`, url: link }).catch(() => {}))
      buttons.push(share)
    }
    const copy = h('button', { type: 'button', class: 'ghost', text: 'リンクをコピー' })
    let copyTimer: ReturnType<typeof setTimeout> | undefined
    copy.addEventListener('click', async () => {
      clearTimeout(copyTimer)
      copy.textContent = (await copyText(link)) ? 'コピーしました' : 'コピーできませんでした'
      copyTimer = setTimeout(() => (copy.textContent = 'リンクをコピー'), 1600)
    })
    buttons.push(copy)
    show(
      '次の人に渡す',
      [
        qrBox,
        h('p', { class: 'send-info' }, [
          h('b', { text: `${formatTime(now)}時点・${pieces(code.counts)}点・${formatPrice(code.total)}` }),
          h('span', { text: '次の人の端末の［引き継ぎ］→［前の人から受け取る］→［QR を読み取る］で読んでもらってください。' }),
        ]),
        h('div', { class: 'send-actions' }, buttons),
        h('p', {
          class: 'handover-note',
          text: '入っているもの: 品目ごとの数・足した品目・釣り銭準備金の開店時の枚数。このあと数えた分は入らないので、渡す直前に出してください。',
        }),
      ],
      true,
    )
    cleanup = () => clearTimeout(copyTimer)
  }

  // ---- 前の人から受け取る ----
  function showReceive(preset?: Loaded) {
    // ふだんは交代（ゼロから）。休憩から戻ったときだけ切り替える
    let mode: HandoverMode = 'zero'
    let loaded: Loaded | null = preset ?? null
    /** QR・報告文の読み取りの知らせ（読めなかったときなど） */
    let readMessage: { kind: 'none' | 'warn'; text: string } | null = null

    // 種類（ゼロから・休憩から戻った）
    const modeButtons = (['zero', 'back'] as const).map((m) => {
      const button = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', text: m === 'zero' ? 'ゼロから引き継ぐ' : '休憩から戻った' })
      button.addEventListener('click', () => {
        mode = m
        render()
      })
      return button
    })
    const modeNote = h('p', { class: 'handover-note' })

    // 入れ方（QR・報告文・打ち込み）
    const scanButton = h('button', { type: 'button', class: 'solid', text: 'カメラで読み取る' })
    const scanner = qrScanner({
      onResult: (text) => {
        scanButton.textContent = 'カメラで読み取る'
        const code = decodeHandoverCode(text)
        if (!code) {
          readMessage = { kind: 'warn', text: '引き継ぎの QR ではありません。前の人の［引き継ぎ］→［次の人に渡す］の QR を読んでください。' }
          render()
          return
        }
        load({ input: inputFromCode(config, options.state(), code), via: 'code' })
      },
      onError: (message) => {
        scanButton.textContent = 'カメラで読み取る'
        readMessage = { kind: 'warn', text: message }
        render()
      },
    })
    scanButton.addEventListener('click', () => {
      if (scanner.running) {
        scanner.stop()
        scanButton.textContent = 'カメラで読み取る'
        return
      }
      readMessage = null
      scanButton.textContent = 'やめる'
      void scanner.start()
      render()
    })
    const pasteBox = h('textarea', {
      class: 'handover-paste',
      rows: 20,
      'aria-label': '前の人の報告文',
      placeholder: '前の人の報告文（またはリンク）をここに貼り付けてください',
    })
    const grow = () => {
      pasteBox.style.height = 'auto'
      pasteBox.style.height = `${pasteBox.scrollHeight + 2}px`
    }
    pasteBox.addEventListener('input', () => {
      grow()
      const text = pasteBox.value
      readMessage = null
      if (text.trim() === '') return render()
      if (hasHandoverCode(text)) {
        const code = decodeHandoverCode(text)
        if (code) return load({ input: inputFromCode(config, options.state(), code), via: 'code' })
      }
      const input = inputFromReport(config, options.state(), text, options.now())
      if (input) return load({ input, via: 'report' })
      readMessage = { kind: 'warn', text: '報告文として読めませんでした。前の人の画面を見て、下の欄に数を打ち込んでください。' }
      render()
    })
    const methodPanels = {
      qr: h('div', { class: 'handover-method' }, [scanButton, scanner.element]),
      paste: h('div', { class: 'handover-method' }, [pasteBox]),
      type: h('div', { class: 'handover-method' }, [h('p', { class: 'handover-note', text: '前の人の画面を見て、下の欄に品目ごとの数を入れてください。' })]),
    }
    const methods = viewTabs(
      [
        { id: 'hv-qr', label: 'QR を読み取る', panel: methodPanels.qr },
        { id: 'hv-paste', label: '報告文を貼る', panel: methodPanels.paste },
        { id: 'hv-type', label: '打ち込む', panel: methodPanels.type },
      ],
      {
        label: '前の人の数の入れ方',
        onChange: (id) => {
          if (id !== 'hv-qr' && scanner.running) {
            scanner.stop()
            scanButton.textContent = 'カメラで読み取る'
          }
          if (id === 'hv-paste') grow()
        },
      },
    )
    methods.element.classList.add('method-tabs')

    // 品目ごとの前の人の数
    const listLabel = h('p', { class: 'handover-list-label' })
    const list = h('div', { class: 'handover-list' })
    const fields = new Map<string, { input: HTMLInputElement; change: HTMLElement }>()
    let listKey = ''
    const messages = h('div', { class: 'handover-msgs', 'aria-live': 'polite' })
    const after = h('b')
    const afterLine = h('p', { class: 'handover-after' }, [h('span', { text: '引き継いだあとの合計' }), after])

    const goButton = h('button', { type: 'button', class: 'solid' })
    const replaceButton = holdButton({ label: '置き換えて引き継ぐ', armedLabel: '長押しで置き換えて引き継ぐ', onConfirm: () => commit() })
    goButton.addEventListener('click', () => commit())
    const cancelButton = h('button', { type: 'button', class: 'ghost', text: 'やめる' })
    cancelButton.addEventListener('click', close)

    /** いまの品目（前の人が足した、この端末にない品目も並べる） */
    const workingState = () => withNewItems(options.state(), loaded?.input.newItems ?? [])
    const readCounts = (): Counts => {
      const counts: Counts = {}
      for (const [id, { input }] of fields) {
        const n = Number(input.value)
        if (input.value.trim() !== '' && Number.isInteger(n) && n > 0) counts[id] = n
      }
      return counts
    }

    function buildList(state: TallyState) {
      const sections = sectionsOf(config, state)
      const fresh = new Set((loaded?.input.newItems ?? []).map((c) => c.id))
      const key = sections.map((s) => s.items.map((i) => i.id).join(',')).join('|')
      if (key === listKey) return
      listKey = key
      const before = readCounts()
      fields.clear()
      list.replaceChildren(
        ...sections.flatMap((section, si) => [
          h('p', { class: si % 2 === 0 ? 'handover-sec' : 'handover-sec alt', text: section.title }),
          ...section.items.map((item) => {
            const name = displayName(config, state, item)
            const input = numberInput({
              placeholder: '0',
              id: `handover-n-${item.id}`,
              'aria-label': `${name} 前の人の数`,
            })
            if (before[item.id]) input.value = String(before[item.id])
            input.addEventListener('input', render)
            const change = h('span', { class: 'handover-change' })
            fields.set(item.id, { input, change })
            return h('div', { class: 'handover-row', 'data-item': item.id }, [
              h('label', { for: input.id }, [name, ...(fresh.has(item.id) ? [h('small', { class: 'handover-new', text: '新しい品目' })] : [])]),
              input,
              change,
            ])
          }),
        ]),
      )
    }

    function load(next: Loaded) {
      loaded = next
      readMessage = null
      buildList(workingState())
      for (const [id, { input }] of fields) {
        const n = next.input.counts[id] ?? 0
        input.value = n > 0 ? String(n) : ''
      }
      render()
    }

    function commit() {
      const counts = readCounts()
      // 報告文から足す品目は、数を入れたものだけ（QR の足した品目は、数がなくても渡す）
      const newItems = (loaded?.input.newItems ?? []).filter((c) => loaded?.via === 'code' || (counts[c.id] ?? 0) > 0)
      const input: HandoverInput = loaded
        ? { ...loaded.input, counts, newItems }
        : { at: null, counts, total: null, newItems: [], floatStart: null, unknown: [] }
      const chosen = mode
      close()
      options.receive(input, chosen)
    }

    function render() {
      const state = workingState()
      buildList(state)
      const now = options.now()
      const counts = readCounts()
      const plan = planHandover(config, state, counts, mode)
      const name = (id: string) => {
        const item = sectionsOf(config, state).flatMap((s) => s.items).find((i) => i.id === id)
        return item ? displayName(config, state, item) : id
      }

      modeButtons.forEach((button, i) => button.setAttribute('aria-checked', String(mode === (['zero', 'back'] as const)[i])))
      modeNote.textContent =
        mode === 'zero'
          ? 'この端末の数を、前の人の数に置き換えます。交代でこの端末を使い始めるとき。'
          : 'この端末の数は残して、休憩のあいだに増えた分だけ足します。'
      listLabel.textContent = mode === 'zero' ? '前の人の数（この数に置き換えます）' : '前の人の数（足りない分だけ足します）'

      for (const line of plan.lines) {
        const field = fields.get(line.itemId)
        if (!field) continue
        field.change.hidden = mode !== 'back' || (line.prev === 0 && line.local === 0)
        field.change.replaceChildren(
          ...(line.local > line.prev
            ? [`この端末 ${line.local}個（前の人より多いので減らしません）`]
            : [`この端末 ${line.local}個 `, h('b', { text: `＋${line.add}` }), ' → ', h('span', { class: 'to', text: `${line.after}個` })]),
        )
      }

      const out: { kind: 'ok' | 'warn' | 'none'; text: string }[] = []
      if (readMessage) out.push(readMessage)
      if (loaded?.via === 'code') {
        const at = new Date(loaded.input.at!)
        const items = Object.keys(loaded.input.counts).length
        const added = loaded.input.newItems.length
        if (now.getTime() - at.getTime() > STALE_MS) {
          out.push({ kind: 'warn', text: `古いデータです（${formatMonthDayTime(at)}時点）。前の人に新しい QR を出してもらってください。` })
        } else {
          out.push({ kind: 'none', text: `前の人の ${formatTime(at)}時点（${age(at, now)}）の数を読み取りました（${items}品目${added ? `・足した品目 ${added}つ` : ''}）。` })
        }
      }
      if (loaded?.via === 'report') {
        const at = loaded.input.at ? `${formatTime(new Date(loaded.input.at))}時点の` : ''
        out.push({ kind: 'none', text: `${at}報告文を読み取りました（${Object.keys(loaded.input.counts).length}品目）。` })
      }
      if (loaded && loaded.input.unknown.length > 0) {
        out.push({
          kind: 'warn',
          text:
            loaded.via === 'report'
              ? `読めなかった行: ${loaded.input.unknown.join('、')}。この端末にない品目なら、［品目］の画面で同じ名前で足してから貼り直してください。`
              : `この端末に入れられない品目があります: ${loaded.input.unknown.join('、')}。ページを開き直して最新にしてから、もう一度読んでください。`,
        })
      }
      const newOnes = (loaded?.input.newItems ?? []).filter((c) => loaded?.via === 'code' || (counts[c.id] ?? 0) > 0)
      if (newOnes.length > 0) {
        // 値段で呼ぶ品目は、名前が値段なので値段をくり返さない
        const describe = (c: (typeof newOnes)[number]) => {
          const section = config.sections.find((s) => s.id === c.sectionId)?.title ?? ''
          return `${name(c.id)}（${c.name === null ? section : `${section}・${formatPrice(c.price)}`}）`
        }
        out.push({ kind: 'warn', text: `この端末にない品目があります: ${newOnes.map(describe).join('、')}。引き継ぐときに［品目］に足します。` })
      }
      if (mode === 'zero' && plan.localPieces > 0) {
        out.push({
          kind: 'warn',
          text: `この端末に残っている記録（${plan.localPieces}点 ${formatPrice(plan.localTotal)}）は取り消して、前の人の数に置き換えます。取り消した記録は［記録］の画面から元に戻せます。`,
        })
      }
      if (plan.more.length > 0) {
        const more = plan.more.map((l) => `${name(l.itemId)}（この端末 ${l.local}・前の人 ${l.prev}）`).join('、')
        out.push({ kind: 'warn', text: `この端末のほうが多い品目: ${more}。減らしません。数を確かめてください。` })
      }
      const reference = loaded?.input.total ?? null
      if (plan.prevPieces > 0 && reference !== null) {
        out.push(
          plan.prevTotal === reference
            ? { kind: 'ok', text: `前の人の数の合計は、前の人の合計 ${formatPrice(reference)} と合っています。` }
            : {
                kind: 'warn',
                text: `前の人の数をこの端末の単価で計算すると ${formatPrice(plan.prevTotal)} で、前の人の合計 ${formatPrice(reference)} と合いません。数や単価のちがいを確かめてください。`,
              },
        )
      } else if (plan.prevPieces > 0) {
        out.push({ kind: 'none', text: `前の人の画面の合計が ${formatPrice(plan.prevTotal)} か確かめてください。` })
      } else if (!loaded && !readMessage) {
        out.push({ kind: 'none', text: 'QR を読み取るか、報告文を貼るか、前の人の数を打ち込んでください。' })
      }
      messages.replaceChildren(...out.map((m) => h('p', { class: `handover-msg ${m.kind}`, text: m.text })))

      afterLine.hidden = plan.prevPieces === 0
      after.textContent = formatPrice(mode === 'back' ? plan.afterTotal : plan.prevTotal)

      const needsHold = mode === 'zero' && plan.localPieces > 0 && plan.prevPieces > 0
      replaceButton.hidden = !needsHold
      replaceButton.querySelector('.hold-idle')!.textContent = `置き換えて引き継ぐ（${plan.prevPieces}点 ${formatPrice(plan.prevTotal)}）`
      goButton.hidden = needsHold
      if (plan.prevPieces === 0) {
        goButton.disabled = true
        goButton.textContent = '前の人の数を入れてください'
      } else if (mode === 'zero') {
        goButton.disabled = false
        goButton.textContent = `引き継ぐ（${plan.prevPieces}点 ${formatPrice(plan.prevTotal)}）`
      } else if (plan.addPieces > 0) {
        goButton.disabled = false
        goButton.textContent = `引き継ぐ（＋${plan.addPieces}点 ${formatPrice(plan.addTotal)}）`
      } else {
        goButton.disabled = true
        goButton.textContent = '足す分はありません'
      }
    }

    show(
      '前の人から受け取る',
      [
        h('div', { class: 'handover-modes', role: 'radiogroup', 'aria-label': '引き継ぎの種類' }, modeButtons),
        modeNote,
        methods.element,
        ...Object.values(methodPanels),
        listLabel,
        list,
        messages,
        afterLine,
        h('div', { class: 'editor-foot' }, [cancelButton, goButton, replaceButton]),
      ],
      !preset,
    )
    cleanup = () => scanner.stop()
    if (preset) load(preset)
    else render()
  }

  if (start) showReceive(start)
  else showMenu()
  document.body.append(dialog)
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  return dialog
}
