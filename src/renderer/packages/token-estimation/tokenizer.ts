/**
 * Moved to shared so the native mobile shell reuses the exact same token
 * estimation logic (js-tiktoken cl100k_base + DeepSeek heuristics).
 */
import { setTokenizerErrorReporter } from '@shared/token-estimation/tokenizer'
import { reportError } from '@/utils/sentry'

// Restore the pre-extraction behavior: tokenizer failures are reported to Sentry
// on the renderer. (Shared defaults to a no-op so it can't import Sentry directly.)
setTokenizerErrorReporter((error) =>
  reportError(error, {
    domain: 'token-estimation',
    operation: 'tokenizer',
  })
)

export * from '@shared/token-estimation/tokenizer'
