import type { Message } from '@shared/types'
import { modelMessageSchema } from 'ai'
import { describe, expect, it } from 'vitest'
import { convertToModelMessages } from './model-message-converter'

// Tool-call fixtures below never reference images, so the resolver is never called.
const noImage = () => Promise.resolve(null)

function assistantWithToolResult(result: unknown): Message {
  return {
    id: 'a1',
    role: 'assistant',
    contentParts: [
      {
        type: 'tool-call',
        state: 'result',
        toolCallId: 'call-1',
        toolName: 'mcp__repro__crash_transport',
        args: { reason: 'repro invalid prompt bug' },
        result,
      },
    ],
  }
}

describe('convertToModelMessages — tool result sanitization', () => {
  it('produces a schema-valid prompt when a tool result is a raw Error object', async () => {
    // Regression: when an MCP tool crashed, the raw Error leaked into history. On the next
    // send, the AI SDK rejected the prompt with AI_InvalidPromptError because an Error is not
    // a valid ModelMessage[] tool output.
    const messages = [assistantWithToolResult(new Error('transport crashed'))]

    const output = await convertToModelMessages(messages, noImage)

    // Every produced message must pass the exact schema the AI SDK validates against.
    for (const msg of output) {
      expect(() => modelMessageSchema.parse(msg)).not.toThrow()
    }

    const toolMsg = output.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    const part = (toolMsg?.content as Array<{ type: string; output: unknown }>)[0]
    expect(part.output).toEqual({ type: 'json', value: { error: 'transport crashed' } })
  })

  it('strips non-serializable values (circular refs) from tool results', async () => {
    const circular: Record<string, unknown> = { ok: true }
    circular.self = circular
    const messages = [assistantWithToolResult(circular)]

    const output = await convertToModelMessages(messages, noImage)

    for (const msg of output) {
      expect(() => modelMessageSchema.parse(msg)).not.toThrow()
    }
    // The whole prompt must JSON round-trip (this is what the SDK ultimately serializes).
    expect(() => JSON.stringify(output)).not.toThrow()
  })

  it('coerces nested Errors and BigInt instead of dropping/throwing', async () => {
    const messages = [assistantWithToolResult({ inner: new Error('boom'), count: 10n, ok: true })]

    const output = await convertToModelMessages(messages, noImage)

    for (const msg of output) {
      expect(() => modelMessageSchema.parse(msg)).not.toThrow()
    }
    const toolMsg = output.find((m) => m.role === 'tool')
    const part = (toolMsg?.content as Array<{ type: string; output: { value: unknown } }>)[0]
    expect(part.output).toEqual({
      type: 'json',
      value: { inner: { error: 'boom' }, count: '10', ok: true },
    })
  })

  it('passes plain JSON tool results through unchanged', async () => {
    const messages = [assistantWithToolResult({ content: [{ type: 'text', text: 'hello' }] })]

    const output = await convertToModelMessages(messages, noImage)

    const toolMsg = output.find((m) => m.role === 'tool')
    const part = (toolMsg?.content as Array<{ type: string; output: unknown }>)[0]
    expect(part.output).toEqual({ type: 'json', value: { content: [{ type: 'text', text: 'hello' }] } })
  })

  it('preserves Gemini thought signatures on assistant tool-call parts', async () => {
    const providerMetadata = { google: { thoughtSignature: 'signature-1' } }
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:write_file',
            args: { path: 'demo.txt', content: 'hello' },
            providerMetadata,
            providerExecuted: true,
            result: { ok: true },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)
    const assistantMsg = output.find((m) => m.role === 'assistant')
    const toolCallPart = (assistantMsg?.content as Array<{ type: string; providerOptions?: unknown }>)[0]

    expect(toolCallPart.providerOptions).toEqual(providerMetadata)
    expect(toolCallPart).toMatchObject({ providerExecuted: true })
    expect(() => modelMessageSchema.parse(assistantMsg)).not.toThrow()
  })

  it('keeps parallel Gemini tool calls in one assistant turn with one matching tool-result turn', async () => {
    const firstProviderMetadata = { google: { thoughtSignature: 'signature-1' } }
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            providerMetadata: firstProviderMetadata,
            stepIndex: 0,
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-2',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(2)', language: 'node' },
            stepIndex: 0,
            result: { stdout: '2\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)

    expect(output).toHaveLength(2)
    expect(output[0].role).toBe('assistant')
    expect(output[1].role).toBe('tool')

    const assistantParts = output[0].content as Array<{ type: string; providerOptions?: unknown }>
    expect(assistantParts).toHaveLength(2)
    expect(assistantParts[0].providerOptions).toEqual(firstProviderMetadata)
    expect(assistantParts[1].providerOptions).toBeUndefined()

    const toolParts = output[1].content as Array<{ type: string; toolCallId: string }>
    expect(toolParts.map((part) => part.toolCallId)).toEqual(['call-1', 'call-2'])
    for (const msg of output) {
      expect(() => modelMessageSchema.parse(msg)).not.toThrow()
    }
  })

  it('adds the documented Google validator bypass to a missing sequential function-call signature', async () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage, {
      modelSupportVision: true,
      ensureGoogleFunctionCallSignatures: true,
    })

    const assistantParts = output[0].content as Array<{ type: string; providerOptions?: unknown }>
    expect(assistantParts[0].providerOptions).toEqual({
      google: { thoughtSignature: 'skip_thought_signature_validator' },
    })
    expect(() => modelMessageSchema.parse(output[0])).not.toThrow()
  })

  it('keeps later parallel calls unsigned when the first call has a signature', async () => {
    const firstProviderMetadata = { google: { thoughtSignature: 'signature-1' } }
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            providerMetadata: firstProviderMetadata,
            stepIndex: 0,
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-2',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(2)', language: 'node' },
            stepIndex: 0,
            result: { stdout: '2\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage, {
      modelSupportVision: true,
      ensureGoogleFunctionCallSignatures: true,
    })

    const assistantParts = output[0].content as Array<{ type: string; providerOptions?: unknown }>
    expect(assistantParts[0].providerOptions).toEqual(firstProviderMetadata)
    expect(assistantParts[1].providerOptions).toBeUndefined()
  })

  it('keeps tool calls with the same step index in one assistant turn', async () => {
    const firstProviderMetadata = { google: { thoughtSignature: 'signature-1' } }
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            providerMetadata: firstProviderMetadata,
            stepIndex: 0,
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-2',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(2)', language: 'node' },
            stepIndex: 0,
            result: { stdout: '2\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)

    expect(output.map((message) => message.role)).toEqual(['assistant', 'tool'])
    expect(output[0].content).toHaveLength(2)
    expect(output[1].content).toHaveLength(2)
  })

  it('keeps different step indices as serial history', async () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            stepIndex: 0,
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-2',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(2)', language: 'node' },
            stepIndex: 1,
            result: { stdout: '2\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)

    expect(output.map((message) => message.role)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
  })

  it('keeps ungrouped consecutive tool calls as serial history', async () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(1)', language: 'node' },
            result: { stdout: '1\n', stderr: '', exitCode: 0 },
          },
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-2',
            toolName: 'default_api:code_execution',
            args: { code: 'console.log(2)', language: 'node' },
            result: { stdout: '2\n', stderr: '', exitCode: 0 },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)

    expect(output.map((message) => message.role)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
    expect((output[0].content as Array<{ toolCallId?: string }>)[0].toolCallId).toBe('call-1')
    expect((output[2].content as Array<{ toolCallId?: string }>)[0].toolCallId).toBe('call-2')
  })

  it('preserves provider metadata on tool results', async () => {
    const resultProviderMetadata = { openai: { itemId: 'result-item-1' } }
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'tool_search',
            args: { query: 'docs' },
            resultProviderMetadata,
            result: { ok: true },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)
    const toolMsg = output.find((m) => m.role === 'tool')
    const toolResultPart = (toolMsg?.content as Array<{ type: string; providerOptions?: unknown }>)[0]

    expect(toolResultPart.providerOptions).toEqual(resultProviderMetadata)
    expect(() => modelMessageSchema.parse(toolMsg)).not.toThrow()
  })

  it('coerces an unparseable string tool-call input into an object', async () => {
    // Regression: when a model emits malformed tool-call arguments (e.g. two concatenated JSON
    // objects), the raw string was stored in `args` and serialized verbatim as `tool_use.input`.
    // Strict Anthropic-compatible upstreams reject that with HTTP 422 ("Input should be a valid
    // dictionary"). The serialized input must always be a JSON object.
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'error',
            toolCallId: 'call-1',
            toolName: 'web_search',
            args: '{"query":"A"}{"query":"B"}',
            result: { error: 'JSON parsing failed', input: '{"query":"A"}{"query":"B"}', toolName: 'web_search' },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)
    const assistantMsg = output.find((m) => m.role === 'assistant')
    const toolCallPart = (assistantMsg?.content as Array<{ type: string; input: unknown }>)[0]

    expect(toolCallPart.type).toBe('tool-call')
    expect(toolCallPart.input).toEqual({})
    for (const msg of output) {
      expect(() => modelMessageSchema.parse(msg)).not.toThrow()
    }
  })

  it('parses a valid JSON-string tool-call input into an object', async () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'web_search',
            args: '{"query":"hello"}',
            result: { ok: true },
          },
        ],
      },
    ]

    const output = await convertToModelMessages(messages, noImage)
    const assistantMsg = output.find((m) => m.role === 'assistant')
    const toolCallPart = (assistantMsg?.content as Array<{ type: string; input: unknown }>)[0]

    expect(toolCallPart.input).toEqual({ query: 'hello' })
  })

  it('preserves reasoning only when requested by the provider path', async () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        contentParts: [
          { type: 'reasoning', text: 'thinking about the answer' },
          { type: 'text', text: 'final answer' },
        ],
      },
    ]

    const defaultOutput = await convertToModelMessages(messages, noImage)
    const defaultAssistant = defaultOutput.find((m) => m.role === 'assistant')
    expect(defaultAssistant?.content).toEqual([{ type: 'text', text: 'final answer' }])

    const preservedOutput = await convertToModelMessages(messages, noImage, {
      modelSupportVision: true,
      preserveReasoning: true,
    })
    const preservedAssistant = preservedOutput.find((m) => m.role === 'assistant')
    expect(preservedAssistant?.content).toEqual([
      { type: 'reasoning', text: 'thinking about the answer' },
      { type: 'text', text: 'final answer' },
    ])
    expect(() => modelMessageSchema.parse(preservedAssistant)).not.toThrow()
  })
})
