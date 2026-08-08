function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function stringProperty(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function numberProperty(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  const record = toRecord(error)
  return stringProperty(record, 'message') ?? String(error)
}

export function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name
  }

  const record = toRecord(error)
  return stringProperty(record, 'name') ?? ''
}

export function getErrorStatusCode(error: unknown): number | undefined {
  const record = toRecord(error)
  const response = toRecord(record?.response)
  const directStatus =
    numberProperty(record, 'statusCode') ??
    numberProperty(record, 'status') ??
    numberProperty(record, 'code') ??
    numberProperty(response, 'status')

  if (directStatus) {
    return directStatus
  }

  const message = getErrorMessage(error)
  const statusMatch =
    message.match(/\bstatus code:\s*(\d{3})\b/i) ??
    message.match(/\bstatus code\s+(\d{3})\b/i) ??
    message.match(/"status"\s*:\s*(\d{3})/i)
  return statusMatch ? Number(statusMatch[1]) : undefined
}

export function isExpectedKnowledgeBaseRerankError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  const statusCode = getErrorStatusCode(error)

  if (
    statusCode === 450 &&
    (message.includes('free_tier_feature_restricted') || message.includes('feature not available'))
  ) {
    return true
  }

  if (statusCode === 400 && (message.includes('ai_provider_error') || message.includes('temporarily unavailable'))) {
    return true
  }

  return false
}

export function isExpectedKnowledgeBaseFileStateError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message === 'invalid file id' ||
    message === 'file not found' ||
    message === 'only failed files can be retried' ||
    message === 'only processing files can be paused' ||
    message === 'only paused files can be resumed'
  )
}
