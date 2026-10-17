import { qrMatrix } from '../core/qr'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** 読み取りに要る、まわりの白い余白（QR の決まりで4マス） */
const QUIET_ZONE = 4

/**
 * text の QR コードを SVG で作る。画面の色（ダークモード）に合わせず、いつも白地に黒で描く（読み取りやすさのため）。
 * 大きさは CSS で決める（viewBox だけ持つ）
 */
export async function qrSvg(text: string, label: string): Promise<SVGSVGElement> {
  const matrix = await qrMatrix(text)
  const size = matrix.length + QUIET_ZONE * 2

  let d = ''
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    }),
  )

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  svg.setAttribute('shape-rendering', 'crispEdges')
  const background = document.createElementNS(SVG_NS, 'rect')
  background.setAttribute('width', String(size))
  background.setAttribute('height', String(size))
  background.setAttribute('fill', '#ffffff')
  const modules = document.createElementNS(SVG_NS, 'path')
  modules.setAttribute('d', d)
  modules.setAttribute('fill', '#000000')
  svg.append(background, modules)
  return svg
}
