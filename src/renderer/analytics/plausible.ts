import { isBuiltinProviderId } from '@shared/providers'

export type PlausibleOptions = {
  props?: Record<string, unknown>
  u?: string
}

export type Plausible = ((event: string, options?: PlausibleOptions) => void) & { q?: unknown[] }

const dynamicRoutePatterns = [
  {
    pattern: /^\/session\/[^/]+/,
    replacement: '/session/:sessionId',
  },
]

const providerRoutePattern = /^\/settings\/provider\/([^/]+)/

const attributionParams = new Set([
  'ref',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

function keepAttributionParams(search: string): string {
  const params = new URLSearchParams(search)
  for (const key of Array.from(params.keys())) {
    if (!attributionParams.has(key)) {
      params.delete(key)
    }
  }
  const filteredSearch = params.toString()
  return filteredSearch ? `?${filteredSearch}` : ''
}

export function normalizePlausiblePath(pathname: string): string {
  const providerRouteMatch = pathname.match(providerRoutePattern)
  if (providerRouteMatch) {
    const providerId = decodeURIComponent(providerRouteMatch[1])
    return isBuiltinProviderId(providerId)
      ? pathname
      : pathname.replace(providerRoutePattern, '/settings/provider/:providerId')
  }

  for (const { pattern, replacement } of dynamicRoutePatterns) {
    if (pattern.test(pathname)) {
      return pathname.replace(pattern, replacement)
    }
  }
  return pathname
}

/**
 * Keep Plausible's page dimension useful and prevent user-scoped route IDs from
 * being sent. Desktop and mobile use hash routing, while web uses pathname routing.
 */
export function normalizePlausibleUrl(href: string): string {
  const url = new URL(href)
  url.search = keepAttributionParams(url.search)

  if (url.hash.startsWith('#/')) {
    const hashUrl = new URL(url.hash.slice(1), 'https://plausible.invalid')
    hashUrl.pathname = normalizePlausiblePath(hashUrl.pathname)
    url.hash = `${hashUrl.pathname}${keepAttributionParams(hashUrl.search)}`
  } else {
    url.pathname = normalizePlausiblePath(url.pathname)
  }

  return url.href
}
