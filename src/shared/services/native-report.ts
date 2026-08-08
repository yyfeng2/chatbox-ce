/**
 * Content reporting (`POST /api/report_content`) with injectable origin/fetch/headers.
 * Used directly by the RN mobile shell, and by the renderer through
 * `packages/remote.ts` which injects its `afetch` and Chatbox headers.
 */

const CHATBOX_DEFAULT_ORIGIN = 'https://api.chatboxai.app'

export interface ReportNativeContentOptions {
  id: string
  type: string
  details: string
  apiOrigin?: string
  fetchFn?: typeof fetch
  headers?: Record<string, string>
}

export async function reportNativeContent(options: ReportNativeContentOptions): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch
  const origin = (options.apiOrigin?.trim() || CHATBOX_DEFAULT_ORIGIN).replace(/\/+$/, '')
  const response = await fetchFn(`${origin}/api/report_content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify({ id: options.id, type: options.type, details: options.details }),
  })
  if (!response.ok) {
    throw new Error(`Report failed with status ${response.status}`)
  }
}
