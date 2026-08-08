type TextToolModelOutput = { type: 'text'; value: string }

type ToolModelOutputOptions = {
  output: unknown
}

type TextModelOutputOptions = {
  emptyFallback?: string
}

const EMPTY_TOOL_OUTPUT_TEXT = '[Tool returned no output.]'

export function toTextModelOutput(format: (output: unknown) => string, options: TextModelOutputOptions = {}) {
  return ({ output }: ToolModelOutputOptions): TextToolModelOutput => {
    const value = format(output)
    return {
      type: 'text',
      value: value.trim() ? value : options.emptyFallback || EMPTY_TOOL_OUTPUT_TEXT,
    }
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

export function numberField(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' ? value : undefined
}

export function contentOrErrorText(output: unknown): string {
  if (typeof output === 'string') return output
  const record = asRecord(output)
  const error = stringField(record, 'error')
  if (error) {
    const errorCode = stringField(record, 'errorCode')
    return errorCode ? `Error code: ${errorCode}\n\nError: ${error}` : `Error: ${error}`
  }
  return stringField(record, 'content') ?? JSON.stringify(output) ?? String(output)
}
