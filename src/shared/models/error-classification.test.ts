import { describe, expect, it } from 'vitest'
import { isExpectedGenerationError } from './error-classification'
import {
  AIProviderNoImplementedPaintError,
  ApiError,
  BaseError,
  ChatboxAIAPIError,
  NetworkError,
  OCRError,
} from './errors'

describe('isExpectedGenerationError', () => {
  it('recognizes provider and user-facing failures', () => {
    expect(isExpectedGenerationError(new ApiError('rate limited'))).toBe(true)
    expect(isExpectedGenerationError(new NetworkError('offline', 'https://example.com'))).toBe(true)
    expect(isExpectedGenerationError(ChatboxAIAPIError.fromCodeName('quota', 'token_quota_exhausted'))).toBe(true)
    expect(isExpectedGenerationError(new AIProviderNoImplementedPaintError('openai'))).toBe(true)
    expect(isExpectedGenerationError(new OCRError('builtin', new BaseError('bad image')))).toBe(true)
  })

  it('keeps unexpected runtime failures reportable', () => {
    expect(isExpectedGenerationError(new Error('boom'))).toBe(false)
    expect(isExpectedGenerationError(new OCRError('builtin', new Error('bad image')))).toBe(false)
    expect(isExpectedGenerationError('string error')).toBe(false)
  })
})
