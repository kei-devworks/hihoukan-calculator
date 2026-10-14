import { JsonStore } from './json-store'
import { storageKey, type KeyValueStorage } from './storage'
import { parseState, type TallyConfig, type TallyState } from './tally'

export type { SaveResult } from './json-store'

/** 保存の形の版。TallyState の形を変えたら上げて、古い版を読む処理を足す */
export const TALLY_STORAGE_VERSION = 1

/** 「個数 × 単価」の1ページ分の状態を、hihoukan-calc:<id>:v1 に保存・復元する */
export class TallyStore extends JsonStore<TallyState> {
  constructor(config: TallyConfig, storage: KeyValueStorage | null) {
    super(storageKey(config.id, TALLY_STORAGE_VERSION), storage, (raw) => parseState(config, raw))
  }
}
