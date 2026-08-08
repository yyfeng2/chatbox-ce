import { describe, expect, it } from 'vitest'
import { imageGenerationSourcesToPictures } from './image-generation-result'

describe('imageGenerationSourcesToPictures', () => {
  it('maps remote and inline image sources to URLs and local records to storage keys', () => {
    expect(
      imageGenerationSourcesToPictures([
        'https://example.com/generated.png',
        'data:image/png;base64,abc',
        'blob:https://example.com/generated',
        'picture:image-gen:record-1:0',
      ])
    ).toEqual([
      { url: 'https://example.com/generated.png' },
      { url: 'data:image/png;base64,abc' },
      { url: 'blob:https://example.com/generated' },
      { storageKey: 'picture:image-gen:record-1:0' },
    ])
  })

  it('drops empty references and trims storage keys', () => {
    expect(imageGenerationSourcesToPictures(['', '  ', ' picture:image-gen:record-1:1 '])).toEqual([
      { storageKey: 'picture:image-gen:record-1:1' },
    ])
  })
})
