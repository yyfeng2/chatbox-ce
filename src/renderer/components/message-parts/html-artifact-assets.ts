type ReadFileBase64 = (filePath: string) => Promise<{ success: boolean; base64?: string }>

const SCRIPT_SRC_RE = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/script>/gi
const STYLESHEET_RE = /<link\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*?)>/gi
const IMAGE_SRC_RE = /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*?)>/gi

function isLocalAssetRef(ref: string): boolean {
  const value = ref.trim()
  if (!value || value.startsWith('#') || value.startsWith('//')) return false
  return !/^[a-z][a-z0-9+.-]*:/i.test(value)
}

function getPathSeparator(filePath: string): '/' | '\\' {
  return filePath.includes('\\') ? '\\' : '/'
}

function dirname(filePath: string): string {
  const separator = getPathSeparator(filePath)
  const index = filePath.lastIndexOf(separator)
  return index >= 0 ? filePath.slice(0, index) : ''
}

function normalizePath(filePath: string, separator: '/' | '\\'): string {
  const prefix = separator === '/' && filePath.startsWith('/') ? '/' : ''
  const parts = filePath.split(/[\\/]+/)
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      normalized.pop()
      continue
    }
    normalized.push(part)
  }
  return prefix + normalized.join(separator)
}

function resolveAssetPath(htmlFilePath: string, assetRef: string): string {
  const separator = getPathSeparator(htmlFilePath)
  const baseDir = dirname(htmlFilePath)
  const relativeRef = assetRef.trim().replace(/^[/\\]+/, '')
  return normalizePath(`${baseDir}${separator}${relativeRef}`, separator)
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js':
    case 'mjs':
      return 'text/javascript'
    case 'css':
      return 'text/css'
    case 'svg':
      return 'image/svg+xml'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function joinAttrs(...attrs: string[]): string {
  const value = attrs.join('').trim()
  return value ? ` ${value}` : ''
}

async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (...args: string[]) => Promise<string>
): Promise<string> {
  const replacements = await Promise.all(Array.from(input.matchAll(regex), (match) => replacer(...match)))
  let index = 0
  return input.replace(regex, () => replacements[index++] ?? '')
}

export async function inlineSandboxHtmlAssets(
  htmlCode: string,
  htmlFilePath: string,
  readFileBase64: ReadFileBase64
): Promise<string> {
  let output = await replaceAsync(htmlCode, SCRIPT_SRC_RE, async (full, before, _quote, src, after) => {
    if (!isLocalAssetRef(src)) return full
    const assetPath = resolveAssetPath(htmlFilePath, src)
    const res = await readFileBase64(assetPath)
    if (!res.success || !res.base64) return full
    return `<script${joinAttrs(before, after)}>\n${decodeBase64Utf8(res.base64)}\n</script>`
  })

  output = await replaceAsync(output, STYLESHEET_RE, async (full, before, _quote, href, after) => {
    if (!isLocalAssetRef(href) || !/\brel=(["'])stylesheet\1/i.test(`${before}${after}`)) return full
    const assetPath = resolveAssetPath(htmlFilePath, href)
    const res = await readFileBase64(assetPath)
    if (!res.success || !res.base64) return full
    return `<style>\n${decodeBase64Utf8(res.base64)}\n</style>`
  })

  output = await replaceAsync(output, IMAGE_SRC_RE, async (full, before, _quote, src, after) => {
    if (!isLocalAssetRef(src)) return full
    const assetPath = resolveAssetPath(htmlFilePath, src)
    const res = await readFileBase64(assetPath)
    if (!res.success || !res.base64) return full
    return `<img${before}src="data:${getMimeType(assetPath)};base64,${res.base64}"${after}>`
  })

  return output
}
