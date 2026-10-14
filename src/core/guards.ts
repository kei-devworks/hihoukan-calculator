/** 保存されていた値（unknown）を読み戻すときの型の確かめ */

/** 0 以上の整数 */
export function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/** 配列でないオブジェクト */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 日時として読める文字列（ISO 8601 など） */
export function isDateString(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}
