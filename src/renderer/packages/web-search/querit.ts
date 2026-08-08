import { searchNativeWeb } from '@shared/services/native-web-search'
import type { SearchResult } from '@shared/types'
import WebSearch from './base'

export { QUERIT_SEARCH_URL } from '@shared/services/native-web-search'

// Thin shell over the shared Querit implementation (native-web-search.ts),
// kept so the provider plugs into the renderer's WebSearch registry.
export class QueritSearch extends WebSearch {
  private apiKey: string
  private maxResults: number
  private timeRange: string | null

  constructor(apiKey: string, maxResults: number = 5, timeRange: string | null = null) {
    super()
    this.apiKey = apiKey
    this.maxResults = maxResults
    this.timeRange = timeRange
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchResult> {
    try {
      const items = await searchNativeWeb(query, {
        provider: 'querit',
        apiKey: this.apiKey,
        maxResults: this.maxResults,
        queritTimeRange: this.timeRange,
        signal,
      })
      return { items }
    } catch (error) {
      console.error('Querit search error:', error)
      throw error
    }
  }
}
