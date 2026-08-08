import type { ImageGeneration } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLiteImageGenerationStorage } from '../SQLiteImageGenerationStorage'

const mockDatabase = vi.hoisted(() => ({
  open: vi.fn(),
  execute: vi.fn(),
  run: vi.fn(),
  query: vi.fn(),
}))

const mockConnection = vi.hoisted(() => ({
  closeConnection: vi.fn(),
  createConnection: vi.fn(),
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  // biome-ignore lint/complexity/useArrowFunction: SQLiteConnection is constructed with new.
  SQLiteConnection: vi.fn(function () {
    return mockConnection
  }),
}))

const source = {
  type: 'chatbox_cli' as const,
  sessionId: 'session-1',
  toolCallId: 'tool-1',
}

function makeRecord(overrides: Partial<ImageGeneration> = {}): ImageGeneration {
  return {
    id: 'record-1',
    prompt: 'red fox',
    referenceImages: [],
    generatedImages: [],
    createdAt: 1_000,
    model: {
      provider: 'chatbox-ai',
      modelId: 'manifest-image',
    },
    status: 'pending',
    taskId: 'task-1',
    source,
    ...overrides,
  }
}

function makeRow(record: ImageGeneration): Record<string, unknown> {
  return {
    id: record.id,
    prompt: record.prompt,
    reference_images: JSON.stringify(record.referenceImages),
    generated_images: JSON.stringify(record.generatedImages),
    generated_image_thumbnails: null,
    created_at: record.createdAt,
    model_provider: record.model.provider,
    model_id: record.model.modelId,
    dalle_style: null,
    image_generate_num: null,
    status: record.status,
    parent_id: null,
    error: null,
    error_code: null,
    error_item_uuid: null,
    task_id: record.taskId,
    aspect_ratio: null,
    source: JSON.stringify(record.source),
  }
}

describe('SQLiteImageGenerationStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnection.createConnection.mockResolvedValue(mockDatabase)
    mockDatabase.open.mockResolvedValue(undefined)
    mockDatabase.execute.mockResolvedValue({ changes: { changes: 0 } })
    mockDatabase.run.mockResolvedValue({ changes: { changes: 1 } })
    mockDatabase.query.mockResolvedValue({ values: [] })
  })

  it('adds the source column for existing mobile databases', async () => {
    const storage = new SQLiteImageGenerationStorage()

    await storage.initialize()

    expect(mockDatabase.execute).toHaveBeenCalledWith('ALTER TABLE image_generation ADD COLUMN source TEXT')
  })

  it('persists and restores the CLI source', async () => {
    const storage = new SQLiteImageGenerationStorage()
    const record = makeRecord()

    await storage.create(record)

    expect(mockDatabase.run).toHaveBeenCalledWith(expect.stringContaining('aspect_ratio, source'), [
      'record-1',
      'red fox',
      '[]',
      '[]',
      null,
      1_000,
      'chatbox-ai',
      'manifest-image',
      null,
      null,
      'pending',
      null,
      null,
      null,
      null,
      'task-1',
      null,
      JSON.stringify(source),
    ])

    mockDatabase.query.mockResolvedValueOnce({ values: [makeRow(record)] })

    await expect(storage.getById(record.id)).resolves.toMatchObject({ source })
  })

  it('preserves the CLI source when updating a record', async () => {
    const storage = new SQLiteImageGenerationStorage()
    const record = makeRecord()
    mockDatabase.query.mockResolvedValueOnce({ values: [makeRow(record)] })

    await expect(storage.update(record.id, { status: 'generating' })).resolves.toMatchObject({
      status: 'generating',
      source,
    })

    expect(mockDatabase.run).toHaveBeenCalledWith(expect.stringContaining('aspect_ratio = ?, source = ?'), [
      'red fox',
      '[]',
      '[]',
      null,
      1_000,
      'chatbox-ai',
      'manifest-image',
      null,
      null,
      'generating',
      null,
      null,
      null,
      null,
      'task-1',
      null,
      JSON.stringify(source),
      'record-1',
    ])
  })
})
