export const WEB_SEARCH_PROVIDERS = [
  { value: 'bing', label: 'Bing Search' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'bocha', label: 'BoCha' },
  { value: 'querit', label: 'Querit' },
] as const

export type WebSearchProviderValue = (typeof WEB_SEARCH_PROVIDERS)[number]['value']
