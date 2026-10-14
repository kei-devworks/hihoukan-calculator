import { describe, expect, it } from 'vitest'
import { sampleConfig as config } from './fixtures'
import { memoryStorage, STORAGE_PREFIX, type KeyValueStorage } from './storage'
import { bump, initialState, setPrice } from './tally'
import { TallyStore } from './tally-store'

const now = new Date('2026-10-15T12:00:00+09:00')

describe('TallyStore', () => {
  it('キーは hihoukan-calc: で始まり、ページの id と版を含む', () => {
    const store = new TallyStore(config, memoryStorage())
    expect(store.key).toBe(`${STORAGE_PREFIX}sample:v1`)
  })

  it('保存した状態を、作り直した store（＝リロード後）で読める', () => {
    const storage = memoryStorage()
    const state = setPrice(config, bump(initialState(), 'a', 3, now), 'soft', 900)
    expect(new TallyStore(config, storage).update(state)).toBe('saved')

    expect(new TallyStore(config, storage).current).toEqual(state)
  })

  it('保存が壊れていても、空の状態で開ける', () => {
    const storage = memoryStorage({ [`${STORAGE_PREFIX}sample:v1`]: '{not json' })
    expect(new TallyStore(config, storage).current).toEqual(initialState())
  })

  it('ほかのページの保存には触れない', () => {
    const storage = memoryStorage({ [`${STORAGE_PREFIX}other:v1`]: '{"counts":{"a":9}}' })
    new TallyStore(config, storage).update(bump(initialState(), 'a', 1, now))
    expect(storage.data.get(`${STORAGE_PREFIX}other:v1`)).toBe('{"counts":{"a":9}}')
  })

  it('reload で、ほかのタブが書いた値を読み直す', () => {
    const storage = memoryStorage()
    const tab1 = new TallyStore(config, storage)
    const tab2 = new TallyStore(config, storage)
    tab2.update(bump(initialState(), 'a', 2, now))
    expect(tab1.current.counts).toEqual({})
    expect(tab1.reload().counts).toEqual({ a: 2 })
  })

  it('保存できない端末（storage が null）でも、メモリ上では動く', () => {
    const store = new TallyStore(config, null)
    expect(store.available).toBe(false)
    expect(store.update(bump(initialState(), 'a', 1, now))).toBe('unavailable')
    expect(store.current.counts).toEqual({ a: 1 })
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
    expect(store.update(bump(initialState(), 'a', 1, now))).toBe('failed')
    expect(store.current.counts).toEqual({ a: 1 })
  })
})
