type ConfirmButtonOptions = {
  label: string
  /** 1回目に押したあとの表示 */
  armedLabel: string
  /** 2回目を受け付ける時間（ミリ秒） */
  timeout?: number
  onConfirm: () => void
}

/**
 * 2回押すと実行するボタン。リセットのように取り消せない操作の誤タップを防ぐ。
 * 1回目で赤くなり、timeout のうちにもう一度押すと onConfirm を呼ぶ
 */
export function confirmButton(button: HTMLButtonElement, options: ConfirmButtonOptions): void {
  const { label, armedLabel, timeout = 3000, onConfirm } = options
  let timer: ReturnType<typeof setTimeout> | undefined

  const disarm = () => {
    clearTimeout(timer)
    timer = undefined
    button.textContent = label
    button.classList.remove('armed')
  }

  button.textContent = label
  button.addEventListener('click', () => {
    if (timer === undefined) {
      button.textContent = armedLabel
      button.classList.add('armed')
      timer = setTimeout(disarm, timeout)
      return
    }
    disarm()
    onConfirm()
  })
}
