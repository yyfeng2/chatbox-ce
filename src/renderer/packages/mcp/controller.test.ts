import { afterEach, describe, expect, it, vi } from 'vitest'
import { MCPServer } from './controller'

interface RecordedRequest {
  method: string
  body?: Record<string, unknown>
  protocolVersion: string | null
}

describe('MCPServer HTTP transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to a 2025-11-25 server that does not support GET SSE', async () => {
    const requests: RecordedRequest[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
        const headers = new Headers(init?.headers)
        requests.push({
          method,
          body,
          protocolVersion: headers.get('mcp-protocol-version'),
        })

        if (method === 'GET') {
          return new Response(null, { status: 405, statusText: 'Method Not Allowed' })
        }

        if (body?.method === 'initialize') {
          return Response.json(
            {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                protocolVersion: '2025-11-25',
                capabilities: { tools: {} },
                serverInfo: { name: 'php-sdk', version: '0.7.0' },
              },
            },
            {
              headers: {
                'mcp-session-id': 'php-sdk-session',
              },
            }
          )
        }

        if (body?.method === 'notifications/initialized') {
          return new Response(null, { status: 202 })
        }

        if (body?.method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                {
                  name: 'echo',
                  description: 'Echo the input text',
                  inputSchema: {
                    type: 'object',
                    properties: { text: { type: 'string' } },
                    required: ['text'],
                  },
                },
              ],
            },
          })
        }

        if (body?.method === 'tools/call') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{ type: 'text', text: 'hello' }],
            },
          })
        }

        return new Response(null, { status: 500 })
      })
    )

    const server = new MCPServer({
      type: 'http',
      url: 'https://php-sdk.example.com/mcp',
    })

    await server.start()

    expect(server.status).toEqual({ state: 'running' })
    expect(Object.keys(server.getAvailableTools())).toEqual(['echo'])
    const echoResult = await server
      .getAvailableTools()
      .echo.execute?.({ text: 'hello' }, { toolCallId: 'echo-call', messages: [] })
    expect(echoResult).toEqual({
      content: [{ type: 'text', text: 'hello' }],
      isError: false,
    })
    expect(requests[0].body).toMatchObject({
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
    })
    expect(requests.map((request) => request.body?.method ?? request.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'GET',
      'tools/list',
      'tools/call',
    ])
    expect(requests.slice(1).map((request) => request.protocolVersion)).toEqual([
      '2025-11-25',
      '2025-11-25',
      '2025-11-25',
      '2025-11-25',
    ])

    await server.stop()
  })

  it('preserves the Streamable HTTP error when the legacy SSE fallback also fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'GET') {
          return new Response(null, { status: 405, statusText: 'Method Not Allowed' })
        }

        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2099-01-01',
            capabilities: {},
            serverInfo: { name: 'future-server', version: '1.0.0' },
          },
        })
      })
    )

    const server = new MCPServer({
      type: 'http',
      url: 'https://future.example.com/mcp',
    })

    await server.start()

    expect(server.status.state).toBe('idle')
    expect(server.status.error).toContain(
      "Streamable HTTP connection failed: Server's protocol version is not supported: 2099-01-01"
    )
    expect(server.status.error).toContain('Legacy SSE fallback failed: MCP SSE Transport Error: 405 Method Not Allowed')
  })
})
