/**
 * 集計ページに共通する画面の部品: 見出し、保存の状態、前の営業日の知らせ、表示を新しく保つしくみ
 */

import type { SaveResult } from '../core/json-store'
import { businessDate, formatMonthDayTime, formatTime } from '../core/time'
import { confirmButton, type ConfirmButtonOptions } from './confirm-button'
import { h } from './dom'

/** 「‹ 一覧」と題名。extra は題名の下に並べる（報告時刻の欄など） */
export function pageHeader(title: string, extra: Node[] = []): HTMLElement {
  return h('header', { class: 'app-head' }, [
    h('a', { class: 'back', href: '../', text: '‹ 一覧' }),
    h('h1', { text: title }),
    ...extra,
  ])
}

export type PageStatusOptions = {
  dayStartHour: number
  /** まだ何も記録していないときの、保存についての説明 */
  idleText: string
  /** 前の営業日の数字が残っているときの知らせの文 */
  carriedText: (since: Date) => string
  /** 知らせに並べるボタン（2回押しで実行） */
  carriedActions: ConfirmButtonOptions[]
}

export type PageStatusView = {
  /** 「この端末に保存済み（最終更新 21:03）」 */
  saveStatus: HTMLElement
  /** 保存できない・失敗したときの赤い知らせ */
  storageWarning: HTMLElement
  /** 前の営業日の数字が残っているときの黄色い知らせ */
  carriedNotice: HTMLElement
  update: (status: {
    available: boolean
    lastSave: SaveResult | null
    updatedAt: string | null
    carriedSince: Date | null
    now: Date
  }) => void
}

export function pageStatus(options: PageStatusOptions): PageStatusView {
  const saveStatus = h('p', { class: 'save-status', role: 'status' })
  const storageWarning = h('p', { class: 'notice warn', role: 'alert', hidden: true })
  const carriedText = h('p')
  const buttons = options.carriedActions.map((action) => {
    const button = h('button', { type: 'button', class: 'ghost' })
    confirmButton(button, action)
    return button
  })
  const carriedNotice = h('div', { class: 'notice', role: 'alert', hidden: true }, [
    carriedText,
    h('div', { class: 'notice-actions' }, buttons),
  ])

  return {
    saveStatus,
    storageWarning,
    carriedNotice,
    update: ({ available, lastSave, updatedAt, carriedSince, now }) => {
      if (!available || lastSave === 'failed') {
        storageWarning.hidden = false
        storageWarning.textContent = available
          ? '保存に失敗しました。端末の空き容量を確かめてください。このままページを閉じると数字が消えます。'
          : 'この端末では数字を保存できません。再読み込みやページを閉じると消えます。プライベートブラウズになっていないか確かめてください。'
        saveStatus.hidden = true
      } else {
        storageWarning.hidden = true
        saveStatus.hidden = false
        if (updatedAt) {
          const updated = new Date(updatedAt)
          const sameDay = businessDate(updated, options.dayStartHour) === businessDate(now, options.dayStartHour)
          saveStatus.textContent = `この端末に保存済み（最終更新 ${sameDay ? formatTime(updated) : formatMonthDayTime(updated)}）`
        } else {
          saveStatus.textContent = options.idleText
        }
      }

      carriedNotice.hidden = carriedSince === null
      if (carriedSince) carriedText.textContent = options.carriedText(carriedSince)
    },
  }
}

/**
 * 開きっぱなしの端末・別のタブ・戻るボタンでも、表示が古くならないようにする。外すための関数を返す。
 * - 30秒ごとと、画面に戻ってきたときに onTick（時刻で変わる表示を合わせる）
 * - 同じ端末の別のタブで保存が変わったら、読み直して onReload
 * - 戻るボタンでキャッシュから表示されたら（その間に別のタブで変わっているかもしれない）、読み直して onReload
 */
export function keepFresh(
  store: { key: string; reload: () => unknown },
  handlers: { onTick: () => void; onReload: () => void },
): () => void {
  const tick = setInterval(handlers.onTick, 30_000)
  const onVisible = () => {
    if (document.visibilityState === 'visible') handlers.onTick()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== store.key && e.key !== null) return
    store.reload()
    handlers.onReload()
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return
    store.reload()
    handlers.onReload()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    clearInterval(tick)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pageshow', onPageShow)
  }
}
