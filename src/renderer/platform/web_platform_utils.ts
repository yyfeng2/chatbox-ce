import { isOfficeFilePath, isPdfFilePath, isTextFilePath } from '@shared/file-extensions'
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

  if (isPdfFilePath(file.name)) {
    try {
      return { text: await parsePdfFileLocally(file), isSupported: true }
    } catch (error) {
      return { text: '', isSupported: false, errorCode: error instanceof Error ? error.message : undefined }
    }
  }

  // Office documents (docx/pptx/xlsx/odt...). The desktop main process uses
  // officeparser (Node fs/Buffer), which cannot run in a browser — extract the
  // text from the Office XML parts directly with jszip instead. Legacy binary
  // formats (.doc/.xls/.ppt) and epub need Node APIs and remain desktop-only.
  if (isOfficeFilePath(file.name)) {
    try {
      const text = await parseOfficeFileInBrowser(file)
      return { text, isSupported: true }
    } catch (error) {
      return { text: '', isSupported: false, errorCode: error instanceof Error ? error.message : undefined }
    }
  }

  return { text: '', isSupported: false }
}

/**
 * Lightweight Office text extraction for browser/mobile builds. Reads the XML
 * parts of the Open Packaging container with jszip and strips the tags:
 *   - docx: word/document.xml  <w:t>…</w:t>
 *   - pptx: ppt/slides/slideN.xml  <a:t>…</a:t>
 *   - xlsx: xl/sharedStrings.xml  <t>…</t>
 */
async function parseOfficeFileInBrowser(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default
  // Convert to ArrayBuffer explicitly: jszip's Blob detection is unreliable
  // across environments (jsdom/node), but ArrayBuffer is always supported.
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const decoder = (xml: string, tagPattern: RegExp) =>
    (xml.match(tagPattern) ?? [])
      .map((match) => match.replace(tagPattern, '$1'))
      .join('\n')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()

  const docx = zip.file('word/document.xml')
  if (docx) {
    return decoder(await docx.async('string'), /<w:t[^>]*>([^<]*)<\/w:t>/g)
  }

  const pptxSlides = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
  if (pptxSlides.length > 0) {
    const parts: string[] = []
    for (const slidePath of pptxSlides.sort()) {
      const xml = await zip.file(slidePath)?.async('string')
      if (xml) parts.push(decoder(xml, /<a:t[^>]*>([^<]*)<\/a:t>/g))
    }
    return parts.join('\n')
  }

  const xlsx = zip.file('xl/sharedStrings.xml')
  if (xlsx) {
    return decoder(await xlsx.async('string'), /<t[^>]*>([^<]*)<\/t>/g)
  }

  throw new Error('Unsupported Office document structure')
}

export async function parseUrlContentFree(url: string) {
  const result = await remote.parseUserLinkFree({ url })
  const key = `parseUrl-${uuidv4()}`
  await platform.setStoreBlob(key, result.text)
  return { key, title: result.title }
}
