import { readJson, writeJson, type KeyValueStorage } from './storage'

export type SaveResult = 'saved' | 'unavailable' | 'failed'

/**
 * 1ページ分の状態を JSON で端末に保存・復元する。
 * 読み戻しは parse に任せる（壊れた値でも例外にせず、使える形に直す関数を渡す）。
 * storage が null（保存できない端末）でも、メモリ上では動き続ける
 */
export class JsonStore<S> {
  private state: S

  constructor(
    readonly key: string,
    private readonly storage: KeyValueStorage | null,
    private readonly parse: (raw: unknown) => S,
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
    return writeJson(this.storage, this.key, next) ? 'saved' : 'failed'
  }

  /** 保存されている値を読み直す（別のタブで変わったときなど） */
  reload(): S {
    this.state = this.read()
    return this.state
  }

  private read(): S {
    return this.parse(this.storage ? readJson(this.storage, this.key) : null)
  }
}
