import { JsonStore } from './json-store'
import { parseStockState, type StockConfig, type StockState } from './stock'
import { storageKey, type KeyValueStorage } from './storage'

/** 保存の形の版。StockState の形を変えたら上げて、古い版を読む処理を足す */
export const STOCK_STORAGE_VERSION = 1

/** 「在庫の差」の1ページ分の記録を、hihoukan-calc:<id>:v1 に保存・復元する */
export class StockStore extends JsonStore<StockState> {
  constructor(config: StockConfig, storage: KeyValueStorage | null) {
    super(storageKey(config.id, STOCK_STORAGE_VERSION), storage, (raw) => parseStockState(config, raw))
  }
}
