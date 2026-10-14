import { describe, expect, it } from 'vitest'
import { memoryStorage, readJson, storageKey, writeJson } from './storage'

describe('storageKey', () => {
  it('hihoukan-calc:<name>:v<version>', () => {
    expect(storageKey('takumi', 1)).toBe('hihoukan-calc:takumi:v1')
  })
})

describe('readJson / writeJson', () => {
  it('書いた値を読める', () => {
    const storage = memoryStorage()
    expect(writeJson(storage, 'k', { a: [1, 2] })).toBe(true)
    expect(readJson(storage, 'k')).toEqual({ a: [1, 2] })
  })

  it('ない・壊れているときは null', () => {
    expect(readJson(memoryStorage(), 'k')).toBeNull()
    expect(readJson(memoryStorage({ k: '{oops' }), 'k')).toBeNull()
  })

  it('読み書きで例外が出ても投げずに null / false', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    }
    expect(readJson(broken, 'k')).toBeNull()
    expect(writeJson(broken, 'k', 1)).toBe(false)
  })
})
