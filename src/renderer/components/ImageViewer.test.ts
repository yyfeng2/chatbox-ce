import type { MessagePicture } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { exportByUrl, exportImageFile } = vi.hoisted(() => ({
  exportByUrl: vi.fn<(filename: string, url: string) => Promise<void>>(),
  exportImageFile: vi.fn<(basename: string, base64: string) => Promise<void>>(),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    exporter: { exportByUrl, exportImageFile },
  },
}))

import { downloadPicture } from './ImageViewer'

describe('downloadPicture', () => {
  beforeEach(() => {
    exportByUrl.mockReset().mockResolvedValue()
    exportImageFile.mockReset().mockResolvedValue()
  })

  it('downloads remote Markdown and message images by URL', async () => {
    await downloadPicture({ url: 'https://example.com/image.png' }, vi.fn())

    expect(exportByUrl).toHaveBeenCalledWith(expect.stringMatching(/^image_/), 'https://example.com/image.png')
    expect(exportImageFile).not.toHaveBeenCalled()
  })

  it('exports inline images as image data', async () => {
    await downloadPicture({ url: 'data:image/png;base64,abc' }, vi.fn())

    expect(exportImageFile).toHaveBeenCalledWith(expect.stringMatching(/^image_/), 'data:image/png;base64,abc')
    expect(exportByUrl).not.toHaveBeenCalled()
  })

  it('loads stored message images before exporting them', async () => {
    const picture: MessagePicture = { storageKey: 'picture:session:message:0' }
    const fetchBlob = vi.fn().mockResolvedValue('data:image/webp;base64,abc')

    await downloadPicture(picture, fetchBlob)

    expect(fetchBlob).toHaveBeenCalledWith(picture.storageKey)
    expect(exportImageFile).toHaveBeenCalledWith(picture.storageKey, 'data:image/webp;base64,abc')
    expect(exportByUrl).not.toHaveBeenCalled()
  })
})
