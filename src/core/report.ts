import { formatYen } from './format'
import {
  countOf,
  grandTotal,
  reportName,
  sectionsOf,
  sectionTotal,
  type TallyConfig,
  type TallySection,
  type TallyState,
} from './tally'

/** 報告文の見出し。設定の印（reportSectionMark）を付ける（画面の見出しには付けない） */
export function reportSectionTitle(config: TallyConfig, section: TallySection): string {
  return `${config.reportSectionMark ?? ''}${section.title}`
}

/**
 * 売上報告の定型文。
 *
 * ```
 * 売上報告
 * 21:00時点
 *
 * ◾️肉
 * 1,000×3
 * ホタテ×2
 * 小計￥5,000-
 *
 * ◾️ソフト
 * バニラ×2
 * 小計￥1,600-
 *
 * 合計￥6,600-
 * ```
 *
 * 0個の品目は書かない。見出しと小計は、0円でも必ず書く。見出しの「◾️」は設定の reportSectionMark で、報告文にだけ付ける。
 * 画面から足した品目は、その見出しの最後に並ぶ
 */
export function buildSalesReport(config: TallyConfig, state: TallyState, time: string): string {
  const lines = [config.reportTitle, `${time}時点`, '']
  for (const section of sectionsOf(config, state)) {
    lines.push(reportSectionTitle(config, section))
    for (const item of section.items) {
      const n = countOf(state, item.id)
      if (n > 0) lines.push(`${reportName(config, state, item)}×${n}`)
    }
    lines.push(`小計${formatYen(sectionTotal(config, state, section))}`)
    lines.push('')
  }
  lines.push(`合計${formatYen(grandTotal(config, state))}`)
  return lines.join('\n')
}
