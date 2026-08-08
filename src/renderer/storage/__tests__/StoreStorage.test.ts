import { describe, expect, it, vi } from 'vitest'
import { StorageKeyGenerator } from '../StoreStorage'

vi.mock('@/platform', () => ({
  default: {
    getStorageType: () => 'test',
  },
}))

describe('StorageKeyGenerator.fileUniqKey', () => {
  it('returns the first computed key when native path becomes available later', () => {
    const file = new File(['content'], 'document.pdf', {
      type: 'application/pdf',
      lastModified: 1710000000000,
    })
    const firstKey = StorageKeyGenerator.fileUniqKey(file)

    Object.defineProperty(file, 'path', {
      value: '/tmp/document.pdf',
      configurable: true,
    })

    expect(StorageKeyGenerator.fileUniqKey(file)).toBe(firstKey)
  })

  it('uses native path when it is available before the first key computation', () => {
    const file = new File(['content'], 'document.pdf', {
      type: 'application/pdf',
      lastModified: 1710000000000,
    })
    Object.defineProperty(file, 'path', {
      value: '/tmp/document.pdf',
      configurable: true,
    })

    expect(StorageKeyGenerator.fileUniqKey(file)).toBe(`file:/tmp/document.pdf-${file.size}-${file.lastModified}`)
  })
})
