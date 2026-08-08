import { describe, expect, test, vi } from 'vitest'

vi.mock('@/platform', () => ({
  default: {
    getStoreBlob: vi.fn(),
    readLocalFileContent: vi.fn(),
  },
}))

import fileToolSet from './file'

async function toModelOutput(tool: unknown, output: unknown) {
  const mapper = tool as {
    toModelOutput: (options: { toolCallId: string; input: unknown; output: unknown }) => Promise<unknown> | unknown
  }
  return await mapper.toModelOutput({ toolCallId: 'tool-call-id', input: {}, output })
}

describe('uploaded file tools model output', () => {
  test('read_file maps empty content to an empty-file result', async () => {
    await expect(toModelOutput(fileToolSet.tools.read_file, { content: '' })).resolves.toEqual({
      type: 'text',
      value: 'File is empty.',
    })
  })
})
