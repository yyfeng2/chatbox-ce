import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockParsePdfFileLocally } = vi.hoisted(() => ({
  mockParsePdfFileLocally: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: {
    setStoreBlob: vi.fn(),
  },
}))

vi.mock('@/packages/pdf-parser', () => ({
  parsePdfFileLocally: mockParsePdfFileLocally,
}))

import { parseFileLocallyInBrowser } from './web_platform_utils'

describe('parseFileLocallyInBrowser', () => {
  beforeEach(() => {
    mockParsePdfFileLocally.mockReset()
  })

  it('reads text files directly', async () => {
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: 'hello', isSupported: true })
    expect(mockParsePdfFileLocally).not.toHaveBeenCalled()
  })

  it('parses PDF files with the browser PDF parser', async () => {
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' })
    mockParsePdfFileLocally.mockResolvedValueOnce('pdf text')

    const result = await parseFileLocallyInBrowser(file)

    expect(mockParsePdfFileLocally).toHaveBeenCalledWith(file)
    expect(result).toEqual({ text: 'pdf text', isSupported: true })
  })

  it('returns unsupported for non-text non-PDF files', async () => {
    const file = new File(['docx'], 'paper.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: '', isSupported: false })
    expect(mockParsePdfFileLocally).not.toHaveBeenCalled()
  })

  it('preserves PDF parser error codes', async () => {
    const file = new File(['%PDF'], 'locked.pdf', { type: 'application/pdf' })
    mockParsePdfFileLocally.mockRejectedValueOnce(new Error('pdf_password_protected'))

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: '', isSupported: false, errorCode: 'pdf_password_protected' })
  })
})
