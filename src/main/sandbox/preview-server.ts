import { createReadStream } from 'node:fs'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import { getSandboxAllowedRoots } from './manager'

let server: Server | null = null
let port: number | null = null

// All roots a preview may serve from (transient temp working dirs + persisted artifacts).
function getSandboxRoots(): string[] {
  return getSandboxAllowedRoots()
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + path.sep)
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function encodeRelativePath(relativePath: string): string {
  return relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function decodeUrlPath(urlPath: string): string {
  return urlPath
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
    .join(path.sep)
}

function rewriteRootRelativeRefs(html: string, relativeDir: string): string {
  const urlDir = encodeRelativePath(relativeDir)
  const prefix = urlDir ? `/sandbox/${urlDir}/` : '/sandbox/'
  return html
    .replace(/\b(src|href)=(["'])\/(?!\/)([^"']+)\2/gi, (_full, attr: string, quote: string, ref: string) => {
      return `${attr}=${quote}${prefix}${ref}${quote}`
    })
    .replace(/\burl\(\s*(["']?)\/(?!\/)([^"')]+)\1\s*\)/gi, (_full, quote: string, ref: string) => {
      return `url(${quote}${prefix}${ref}${quote})`
    })
}

function getRefererRelativeDir(req: IncomingMessage): string | null {
  const referer = req.headers.referer
  if (!referer) return null
  try {
    const url = new URL(referer)
    if (!url.pathname.startsWith('/sandbox/')) return null
    const relativePath = decodeUrlPath(url.pathname.slice('/sandbox/'.length))
    return path.dirname(relativePath)
  } catch {
    return null
  }
}

async function resolveRequestPath(
  req: IncomingMessage,
  sandboxRoots: string[]
): Promise<{
  relativePath: string
  resolvedPath: string
}> {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let relativePath: string

  if (url.pathname.startsWith('/sandbox/')) {
    relativePath = decodeUrlPath(url.pathname.slice('/sandbox/'.length))
  } else {
    const refererDir = getRefererRelativeDir(req)
    if (!refererDir) throw new Error('Not found')
    relativePath = path.join(refererDir, decodeUrlPath(url.pathname))
  }

  // The relative path is resolved against each root; the first match that stays inside
  // its root and exists wins. Single self-contained artifacts resolve unambiguously.
  for (const sandboxRoot of sandboxRoots) {
    const targetPath = path.resolve(sandboxRoot, relativePath)
    try {
      const resolvedPath = await realpath(targetPath)
      if (isInside(sandboxRoot, resolvedPath)) {
        return { relativePath: path.relative(sandboxRoot, resolvedPath), resolvedPath }
      }
    } catch {
      // Not in this root — try the next.
    }
  }
  throw new Error('Not found')
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const sandboxRoots = getSandboxRoots()
    const { relativePath, resolvedPath } = await resolveRequestPath(req, sandboxRoots)
    const fileStat = await stat(resolvedPath)
    if (!fileStat.isFile()) {
      res.writeHead(404).end('Not found')
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', getMimeType(resolvedPath))

    if (['.html', '.htm'].includes(path.extname(resolvedPath).toLowerCase())) {
      const html = await readFile(resolvedPath, 'utf8')
      res.writeHead(200).end(rewriteRootRelativeRefs(html, path.dirname(relativePath)))
      return
    }

    createReadStream(resolvedPath).pipe(res)
  } catch {
    res.writeHead(404).end('Not found')
  }
}

async function ensurePreviewServer(): Promise<number> {
  if (server && port !== null) return port

  server = createServer((req, res) => {
    void handleRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject)
    server?.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      if (address && typeof address === 'object') {
        port = address.port
        resolve()
      } else {
        reject(new Error('Failed to start preview server'))
      }
    })
  })

  if (port === null) throw new Error('Failed to start preview server')
  return port
}

export async function createSandboxHtmlPreviewUrl(
  filePath: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const sandboxRoots = getSandboxRoots()
    const fileStat = await lstat(filePath)
    if (fileStat.isSymbolicLink()) {
      return { success: false, error: 'Access denied: symlinks not allowed' }
    }
    const resolvedPath = await realpath(filePath)
    const sandboxRoot = sandboxRoots.find((root) => isInside(root, resolvedPath))
    if (!sandboxRoot) {
      return { success: false, error: 'Access denied: path outside sandbox directory' }
    }
    if (!['.html', '.htm'].includes(path.extname(resolvedPath).toLowerCase())) {
      return { success: false, error: 'Preview only supports HTML files' }
    }
    const resolvedStat = await stat(resolvedPath)
    if (!resolvedStat.isFile()) {
      return { success: false, error: 'File not found' }
    }

    const listenPort = await ensurePreviewServer()
    const relativePath = path.relative(sandboxRoot, resolvedPath)
    return {
      success: true,
      url: `http://127.0.0.1:${listenPort}/sandbox/${encodeRelativePath(relativePath)}`,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { success: false, error: msg }
  }
}

export function stopSandboxHtmlPreviewServer(): void {
  server?.close()
  server = null
  port = null
}
