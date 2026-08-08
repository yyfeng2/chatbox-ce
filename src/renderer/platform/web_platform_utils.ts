import { isPdfFilePath, isTextFilePath } from '@shared/file-extensions'
import { v4 as uuidv4 } from 'uuid'
import { parsePdfFileLocally } from '@/packages/pdf-parser'
import platform from '@/platform'
import * as remote from '../packages/remote'

export async function parseTextFileLocally(file: File): Promise<{ text: string; isSupported: boolean }> {
  if (!isTextFilePath(file.name)) {
    // 只在桌面端有 attachment.path，网页版本只有 attachment.name
    return { text: '', isSupported: false }
  }
  const text = await file.text()
  return { text, isSupported: true }
}

export async function parseFileLocallyInBrowser(
  file: File
): Promise<{ text: string; isSupported: boolean; errorCode?: string }> {
  if (isTextFilePath(file.name)) {
    return parseTextFileLocally(file)
  }

  if (!isPdfFilePath(file.name)) {
    return { text: '', isSupported: false }
  }

  try {
    return { text: await parsePdfFileLocally(file), isSupported: true }
  } catch (error) {
    return { text: '', isSupported: false, errorCode: error instanceof Error ? error.message : undefined }
  }
}

export async function parseUrlContentFree(url: string) {
  const result = await remote.parseUserLinkFree({ url })
  const key = `parseUrl-${uuidv4()}`
  await platform.setStoreBlob(key, result.text)
  return { key, title: result.title }
}
