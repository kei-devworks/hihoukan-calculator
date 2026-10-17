import { h } from './dom'

export type HoldButtonOptions = {
  /** ふだんの文言（例: 'このオーダーを取り消す'） */
  label: string
  /** 1回目のタップのあとの文言。何を消すのかわかるように書く（例: '長押しでオーダーを取り消す'） */
  armedLabel: string
  onConfirm: () => void
  /** 長押しの長さ（ミリ秒） */
  holdMs?: number
  /** 1回目のタップのあと、長押しを受け付ける時間（ミリ秒） */
  armMs?: number
}

/**
 * タップで構えて、長押しで実行するボタン。取り消し・リセットのように消える操作の誤タップを防ぐ。
 * ふだんは赤い枠。1回目のタップで赤い背景の armedLabel に変わり、armMs のうちに holdMs 押し続けると onConfirm を呼ぶ。
 * 押している間はボタンが左から埋まり、途中で離すとやめる。2つの文言は重ねて置き、ボタンの大きさは変えない
 */
export function holdButton(options: HoldButtonOptions): HTMLButtonElement {
  const { label, armedLabel, onConfirm, holdMs = 1000, armMs = 4000 } = options
  const button = h('button', { type: 'button', class: 'hold-button' }, [
    h('span', { class: 'hold-idle', text: label }),
    h('span', { class: 'hold-armed', text: armedLabel }),
  ])
  button.style.setProperty('--hold-ms', `${holdMs}ms`)

  let armTimer: ReturnType<typeof setTimeout> | undefined
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  /** 長押しで実行した直後のクリック（指を離したときに来る）で、また構えないようにする */
  let justConfirmed = false

  const isArmed = () => button.classList.contains('armed')
  const isHolding = () => button.classList.contains('holding')
  const disarm = () => {
    clearTimeout(armTimer)
    clearTimeout(holdTimer)
    button.classList.remove('armed', 'holding')
  }
  const waitForHold = () => {
    clearTimeout(armTimer)
    armTimer = setTimeout(disarm, armMs)
  }
  const startHold = () => {
    if (!isArmed() || isHolding()) return
    clearTimeout(armTimer)
    button.classList.add('holding')
    holdTimer = setTimeout(() => {
      disarm()
      justConfirmed = true
      onConfirm()
    }, holdMs)
  }
  const stopHold = () => {
    if (!isHolding()) return
    clearTimeout(holdTimer)
    button.classList.remove('holding')
    waitForHold()
  }

  button.addEventListener('click', () => {
    if (justConfirmed) {
      justConfirmed = false
      return
    }
    if (isArmed()) return
    button.classList.add('armed')
    waitForHold()
  })
  button.addEventListener('pointerdown', (e) => {
    justConfirmed = false
    if (!isArmed()) return
    // 長押しで文字が選ばれたり、画面が動いたりしないように
    e.preventDefault()
    startHold()
  })
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stopHold)
  // Android の長押しのメニューを出さない
  button.addEventListener('contextmenu', (e) => e.preventDefault())
  // キーボードでは Enter か Space を押し続ける
  button.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !isArmed()) return
    e.preventDefault()
    startHold()
  })
  button.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (isArmed() || justConfirmed) e.preventDefault()
    stopHold()
  })
  return button
}
