import { readJson, storageKey, writeJson, type KeyValueStorage } from './storage'
import { initialState, parseState, type TallyConfig, type TallyState } from './tally'

/** 保存の形の版。TallyState の形を変えたら上げて、古い版を読む処理を足す */
export const TALLY_STORAGE_VERSION = 1

export type SaveResult = 'saved' | 'unavailable' | 'failed'

/**
 * 1ページ分の TallyState を端末に保存・復元する。
 * storage が null（保存できない端末）でも、メモリ上では動き続ける
 */
export class TallyStore {
  readonly key: string
  private state: TallyState

  constructor(
    private readonly config: TallyConfig,
    private readonly storage: KeyValueStorage | null,
  ) {
    this.key = storageKey(config.id, TALLY_STORAGE_VERSION)
    this.state = this.read()
  }

  get available(): boolean {
    return this.storage !== null
  }

  get current(): TallyState {
    return this.state
  }

  /** 状態を差し替えて保存する */
  update(next: TallyState): SaveResult {
    this.state = next
    if (!this.storage) return 'unavailable'
    return writeJson(this.storage, this.key, next) ? 'saved' : 'failed'
  }

  /** 保存されている値を読み直す（別のタブで変わったときなど） */
  reload(): TallyState {
    this.state = this.read()
    return this.state
  }

  private read(): TallyState {
    if (!this.storage) return initialState()
    return parseState(this.config, readJson(this.storage, this.key))
  }
}
