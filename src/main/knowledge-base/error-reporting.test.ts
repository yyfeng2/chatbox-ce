import { describe, expect, test } from 'vitest'
import {
  getErrorStatusCode,
  isExpectedKnowledgeBaseFileStateError,
  isExpectedKnowledgeBaseRerankError,
} from './error-reporting'

describe('knowledge-base error reporting', () => {
  test('extracts status codes from sdk error messages', () => {
    expect(getErrorStatusCode(new Error('BadRequestError\nStatus code: 400\nBody: {}'))).toBe(400)
    expect(getErrorStatusCode(new Error('API Error: Status Code 500, {"error":{"status":500}}'))).toBe(500)
  })

  test('treats transient provider rerank failures as expected', () => {
    const error = new Error(`BadRequestError
Status code: 400
Body: {
  "error": {
    "code": "ai_provider_error",
    "detail": "The AI provider is temporarily unavailable. Please try again later.",
    "status": 400
  }
}`)

    expect(isExpectedKnowledgeBaseRerankError(error)).toBe(true)
  })

  test('treats free-plan rerank restriction as expected', () => {
    const error = new Error(`Status code: 450
Body: {
  "error": {
    "code": "free_tier_feature_restricted",
    "detail": "This feature is not available on the free plan.",
    "status": 450
  }
}`)

    expect(isExpectedKnowledgeBaseRerankError(error)).toBe(true)
  })

  test('keeps unknown rerank failures reportable', () => {
    expect(isExpectedKnowledgeBaseRerankError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  test('keeps generic bad request rerank failures reportable', () => {
    const error = new Error(`BadRequestError
Status code: 400
Body: {
  "message": "invalid request: documents must contain at least one non-empty string"
}`)

    expect(isExpectedKnowledgeBaseRerankError(error)).toBe(false)
  })

  test('treats file state validation failures as expected', () => {
    expect(isExpectedKnowledgeBaseFileStateError(new Error('File not found'))).toBe(true)
    expect(isExpectedKnowledgeBaseFileStateError(new Error('Only processing files can be paused'))).toBe(true)
    expect(isExpectedKnowledgeBaseFileStateError(new Error('Database not initialized'))).toBe(false)
  })
})
