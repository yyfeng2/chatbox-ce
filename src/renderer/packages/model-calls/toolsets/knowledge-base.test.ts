import { describe, expect, test, vi } from 'vitest'

vi.mock('@/platform', () => ({
  default: {
    getKnowledgeBaseController: () => ({
      search: vi.fn(),
      getFilesMeta: vi.fn(),
      readFileChunks: vi.fn(),
      listFilesPaginated: vi.fn(),
    }),
  },
}))

import { getFilesMetaTool, listFilesTool, queryKnowledgeBaseTool, readFileChunksTool } from './knowledge-base'

async function toModelOutput(tool: unknown, output: unknown) {
  const mapper = tool as {
    toModelOutput: (options: { toolCallId: string; input: unknown; output: unknown }) => Promise<unknown> | unknown
  }
  return await mapper.toModelOutput({ toolCallId: 'tool-call-id', input: {}, output })
}

describe('knowledge base toolset model output', () => {
  test('query_knowledge_base maps search results to readable model text', async () => {
    await expect(
      toModelOutput(queryKnowledgeBaseTool(1), [
        {
          filename: 'manual.pdf',
          chunkIndex: 3,
          score: 0.92345,
          text: 'Relevant knowledge base text.',
        },
      ])
    ).resolves.toEqual({
      type: 'text',
      value: 'Result 1\nSource: manual.pdf\nChunk: 3\nScore: 0.923\nText:\nRelevant knowledge base text.',
    })
  })

  test('get_files_meta maps file metadata to readable model text', async () => {
    await expect(
      toModelOutput(getFilesMetaTool(1), [
        {
          id: 7,
          filename: 'manual.pdf',
          chunk_count: 12,
          status: 'done',
        },
      ])
    ).resolves.toEqual({
      type: 'text',
      value: 'File 1\nName: manual.pdf\nID: 7\nChunks: 12\nStatus: done',
    })
  })

  test('read_file_chunks maps chunks to readable model text', async () => {
    await expect(
      toModelOutput(readFileChunksTool(1), [
        {
          filename: 'manual.pdf',
          chunk_index: 4,
          content: 'Chunk body.',
        },
      ])
    ).resolves.toEqual({
      type: 'text',
      value: 'Chunk 1\nSource: manual.pdf\nChunk: 4\nContent:\nChunk body.',
    })
  })

  test('list_files maps paginated files to readable model text', async () => {
    await expect(
      toModelOutput(listFilesTool(1), [
        {
          id: 8,
          filename: 'overview.md',
          chunkCount: 2,
        },
      ])
    ).resolves.toEqual({
      type: 'text',
      value: 'File 1\nName: overview.md\nID: 8\nChunks: 2',
    })
  })
})
