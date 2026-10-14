/**
 * 端末への保存（localStorage）。
 *
 * kei-devworks.github.io の下のサイトは、リポジトリが違っても保存場所を共有する。
 * ほかのサイトの値と混ざらないよう、キーは必ず STORAGE_PREFIX で始める（docs/deployment.md）
 */

export const STORAGE_PREFIX = 'hihoukan-calc:'

/** localStorage の必要な部分だけ。テストではメモリ上の実装を渡す */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** 'hihoukan-calc:<name>:v<version>'。保存の形を変えるときは version を上げる */
export function storageKey(name: string, version: number): string {
  return `${STORAGE_PREFIX}${name}:v${version}`
}

/**
 * 使える localStorage を返す。設定で無効にされている・容量がないなどで書けなければ null。
 * 実際に書いて消してみて確かめる（読めても書けないブラウザがあるため）
 */
export function openLocalStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage
    const probe = `${STORAGE_PREFIX}__probe__`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

/** JSON として読む。ない・壊れている・読めないときは null */
export function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/** JSON で書く。書けなければ false（容量不足など） */
export function writeJson(storage: KeyValueStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** テスト用の、メモリ上の KeyValueStorage */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  }
}
