import { describe, expect, it } from 'vitest'
import { sampleConfig as config } from './fixtures'
import { memoryStorage, STORAGE_PREFIX, type KeyValueStorage } from './storage'
import { addItem } from './orders'
import { countsOf, initialState, setPrice } from './tally'
import { TallyStore } from './tally-store'

const now = new Date('2026-10-15T12:00:00+09:00')

describe('TallyStore', () => {
  it('キーは hihoukan-calc: で始まり、ページの id と版を含む', () => {
    const store = new TallyStore(config, memoryStorage())
    expect(store.key).toBe(`${STORAGE_PREFIX}sample:v2`)
  })

  it('保存した状態を、作り直した store（＝リロード後）で読める', () => {
    const storage = memoryStorage()
    const state = setPrice(config, addItem(addItem(initialState(), 'a', now), 'a', now), 'soft', 900)
    expect(new TallyStore(config, storage).update(state)).toBe('saved')

    expect(new TallyStore(config, storage).current).toEqual(state)
  })

  it('保存が壊れていても、空の状態で開ける', () => {
    const storage = memoryStorage({ [`${STORAGE_PREFIX}sample:v2`]: '{not json' })
    expect(new TallyStore(config, storage).current).toEqual(initialState())
  })

  it('ほかのページの保存には触れない', () => {
    const storage = memoryStorage({ [`${STORAGE_PREFIX}other:v1`]: '{"counts":{"a":9}}' })
    new TallyStore(config, storage).update(addItem(initialState(), 'a', now))
    expect(storage.data.get(`${STORAGE_PREFIX}other:v1`)).toBe('{"counts":{"a":9}}')
  })

  it('reload で、ほかのタブが書いた値を読み直す', () => {
    const storage = memoryStorage()
    const tab1 = new TallyStore(config, storage)
    const tab2 = new TallyStore(config, storage)
    tab2.update(addItem(addItem(initialState(), 'a', now), 'a', now))
    expect(countsOf(tab1.current)).toEqual({})
    expect(countsOf(tab1.reload())).toEqual({ a: 2 })
  })

  it('保存できない端末（storage が null）でも、メモリ上では動く', () => {
    const store = new TallyStore(config, null)
    expect(store.available).toBe(false)
    expect(store.update(addItem(initialState(), 'a', now))).toBe('unavailable')
    expect(countsOf(store.current)).toEqual({ a: 1 })
  })

  it('書き込みに失敗したら failed を返し、メモリ上の状態は進める', () => {
    const full: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
    }
    const store = new TallyStore(config, full)
    expect(store.update(addItem(initialState(), 'a', now))).toBe('failed')
    expect(countsOf(store.current)).toEqual({ a: 1 })
  })

  describe('版 1（品目ごとの個数）からの読み替え', () => {
    const v1Key = `${STORAGE_PREFIX}sample:v1`
    const v2Key = `${STORAGE_PREFIX}sample:v2`
    const v1 = JSON.stringify({ counts: { a: 3, vanilla: 1 }, priceOverrides: {}, updatedAt: '2026-10-15T03:00:00.000Z', startedAt: '2026-10-15T01:00:00.000Z' })

    it('v2 がなければ版 1 を読み、個数はそのまま', () => {
      const store = new TallyStore(config, memoryStorage({ [v1Key]: v1 }))
      expect(countsOf(store.current)).toEqual({ a: 3, vanilla: 1 })
      expect(store.current.orders[0]!.kind).toBe('handover')
    })

    it('v2 に書けたら、版 1 のキーを消す', () => {
      const storage = memoryStorage({ [v1Key]: v1 })
      const store = new TallyStore(config, storage)
      expect(store.update(addItem(store.current, 'b', now))).toBe('saved')
      expect(storage.data.has(v1Key)).toBe(false)
      expect(countsOf(new TallyStore(config, storage).current)).toEqual({ a: 3, b: 1, vanilla: 1 })
    })

    it('v2 があれば、版 1 が残っていても v2 を読む', () => {
      const storage = memoryStorage({ [v1Key]: v1 })
      const fresh = new TallyStore(config, memoryStorage()).current
      storage.setItem(v2Key, JSON.stringify(addItem(fresh, 'hotate', now)))
      expect(countsOf(new TallyStore(config, storage).current)).toEqual({ hotate: 1 })
    })
  })
})
