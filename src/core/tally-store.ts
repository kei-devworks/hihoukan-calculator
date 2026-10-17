import { JsonStore } from './json-store'
import { storageKey, type KeyValueStorage } from './storage'
import { parseState, type TallyConfig, type TallyState } from './tally'

export type { SaveResult } from './json-store'

/**
 * 保存の形の版。TallyState の形を変えたら上げて、古い版を読む処理を足す。
 * 版 1 は品目ごとの個数だけ、版 2 はオーダーの記録（parseState が版 1 も読み替える）
 */
export const TALLY_STORAGE_VERSION = 2

/** 「個数 × 単価」の1ページ分の状態を、hihoukan-calc:<id>:v2 に保存・復元する。版 1 が残っていれば読み替える */
export class TallyStore extends JsonStore<TallyState> {
  constructor(config: TallyConfig, storage: KeyValueStorage | null) {
    super(storageKey(config.id, TALLY_STORAGE_VERSION), storage, (raw) => parseState(config, raw), [storageKey(config.id, 1)])
  }
}
