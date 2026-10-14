import { JsonStore } from './json-store'
import { storageKey, type KeyValueStorage } from './storage'
import { parseWorkState, type WorkReportConfig, type WorkReportState } from './work-report'

/** 保存の形の版。WorkReportState の形を変えたら上げて、古い版を読む処理を足す */
export const WORK_REPORT_STORAGE_VERSION = 1

/** 勤務時間報告の設定・記録・書きかけを、hihoukan-calc:<id>:v1 に保存・復元する */
export class WorkReportStore extends JsonStore<WorkReportState> {
  constructor(config: WorkReportConfig, storage: KeyValueStorage | null) {
    super(storageKey(config.id, WORK_REPORT_STORAGE_VERSION), storage, parseWorkState)
  }
}
