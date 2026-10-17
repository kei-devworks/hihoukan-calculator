import { readJson, removeKey, writeJson, type KeyValueStorage } from './storage'

export type SaveResult = 'saved' | 'unavailable' | 'failed'

/**
 * 1ページ分の状態を JSON で端末に保存・復元する。
 * 読み戻しは parse に任せる（壊れた値でも例外にせず、使える形に直す関数を渡す）。
 * storage が null（保存できない端末）でも、メモリ上では動き続ける。
 * 保存の形を変えて版を上げたときは、legacyKeys に古い版のキーを渡す。新しいキーに何もなければ古いキーを読み
 * （読み替えは parse に任せる）、新しいキーに書けたら古いキーは消す
 */
export class JsonStore<S> {
  private state: S

  constructor(
    readonly key: string,
    private readonly storage: KeyValueStorage | null,
    private readonly parse: (raw: unknown) => S,
    private readonly legacyKeys: readonly string[] = [],
  ) {
    this.state = this.read()
  }

  get available(): boolean {
    return this.storage !== null
  }

  get current(): S {
    return this.state
  }

  /** 状態を差し替えて保存する */
  update(next: S): SaveResult {
    this.state = next
    if (!this.storage) return 'unavailable'
    if (!writeJson(this.storage, this.key, next)) return 'failed'
    for (const key of this.legacyKeys) removeKey(this.storage, key)
    return 'saved'
  }

  /** 保存されている値を読み直す（別のタブで変わったときなど） */
  reload(): S {
    this.state = this.read()
    return this.state
  }

  private read(): S {
    if (!this.storage) return this.parse(null)
    let raw = readJson(this.storage, this.key)
    for (const key of this.legacyKeys) {
      if (raw !== null) break
      raw = readJson(this.storage, key)
    }
    return this.parse(raw)
  }
}
