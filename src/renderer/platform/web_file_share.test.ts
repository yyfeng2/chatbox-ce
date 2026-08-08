// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { canShareFile, shareFile } from './web_file_share'

const file = new File(['backup'], 'backup.zip', { type: 'application/zip' })

describe('web file sharing', () => {
  it('requires file sharing support', () => {
    expect(canShareFile(file, {})).toBe(false)
    expect(canShareFile(file, { canShare: () => true })).toBe(false)
  })

  it('checks whether the file can be shared', () => {
    const canShare = vi.fn().mockReturnValue(true)
    const share = vi.fn()

    expect(canShareFile(file, { canShare, share })).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
  })

  it('uses the native share surface for the backup file', async () => {
    const share = vi.fn().mockResolvedValue(undefined)

    await expect(shareFile(file, { canShare: () => true, share })).resolves.toBe(true)
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: 'backup.zip',
    })
  })

  it('does not attempt to share an unsupported file', async () => {
    const share = vi.fn()

    await expect(shareFile(file, { canShare: () => false, share })).resolves.toBe(false)
    expect(share).not.toHaveBeenCalled()
  })
})
