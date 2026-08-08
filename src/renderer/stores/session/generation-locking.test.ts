import type { Message, Session } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getSessionMock,
  getSessionSettingsMock,
  createInactiveForkMock,
  insertMessageAfterMock,
  orchestrateGenerationMock,
  orchestratePictureGenerationMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionSettingsMock: vi.fn(),
  createInactiveForkMock: vi.fn(),
  insertMessageAfterMock: vi.fn(),
  orchestrateGenerationMock: vi.fn(),
  orchestratePictureGenerationMock: vi.fn(),
}))

vi.mock('../chatStore', () => ({
  getSession: getSessionMock,
  getSessionSettings: getSessionSettingsMock,
}))
vi.mock('./attachment-resolver', () => ({ createAttachmentResolver: vi.fn() }))
vi.mock('./forks', () => ({
  createInactiveFork: createInactiveForkMock,
  createNewFork: vi.fn(),
  findMessageLocation: vi.fn(),
}))
vi.mock('./messages', () => ({ insertMessageAfter: insertMessageAfterMock }))
vi.mock('./orchestration', () => ({ orchestrateGeneration: orchestrateGenerationMock }))
vi.mock('./pictures', () => ({ orchestratePictureGeneration: orchestratePictureGenerationMock }))
vi.mock('./utils', () => ({ getSessionWebBrowsing: vi.fn() }))

import { generate, generateMore } from './generation'
import { resetSessionGenerationLocksForTests } from './generation-lock'

function message(id: string): Message {
  return { id, role: 'assistant', contentParts: [], generating: true }
}

describe('generation entry-point locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSessionGenerationLocksForTests()
    getSessionMock.mockResolvedValue({ id: 'session-1', name: 'Session', messages: [] })
    getSessionSettingsMock.mockResolvedValue({})
    createInactiveForkMock.mockImplementation(async (_sessionId, _msgId, branchMessages: Message[]) => [
      { id: 'user-1', role: 'user', contentParts: [] },
      ...branchMessages,
    ])
    insertMessageAfterMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetSessionGenerationLocksForTests()
  })

  it('serializes public generation calls for the same session', async () => {
    let finishFirst = () => {}
    const firstGeneration = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    orchestrateGenerationMock.mockReturnValueOnce(firstGeneration).mockResolvedValueOnce(undefined)

    const first = generate('session-1', message('assistant-1'))
    const second = generate('session-1', message('assistant-2'))

    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())
    finishFirst()
    await Promise.all([first, second])

    expect(orchestrateGenerationMock.mock.calls.map((call) => call[1].id)).toEqual(['assistant-1', 'assistant-2'])
  })

  it('starts multiple alternative replies for the same message concurrently', async () => {
    let finishFirst = () => {}
    const firstGeneration = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    orchestrateGenerationMock.mockReturnValueOnce(firstGeneration).mockResolvedValueOnce(undefined)

    const first = generateMore('session-1', 'user-1')
    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledOnce())

    const second = generateMore('session-1', 'user-1')
    await vi.waitFor(() => expect(orchestrateGenerationMock).toHaveBeenCalledTimes(2))

    expect(createInactiveForkMock).toHaveBeenCalledTimes(2)
    expect(createInactiveForkMock.mock.calls.map((call) => call[1])).toEqual(['user-1', 'user-1'])
    expect(insertMessageAfterMock).not.toHaveBeenCalled()
    expect(orchestrateGenerationMock.mock.calls.every((call) => call[2].contextMessages.length === 2)).toBe(true)

    finishFirst()
    await Promise.all([first, second])
  })

  it('inserts the first reply normally when the prompt has no active answer yet', async () => {
    createInactiveForkMock.mockResolvedValueOnce(null)

    await generateMore('session-1', 'user-1')

    expect(insertMessageAfterMock).toHaveBeenCalledOnce()
    expect(insertMessageAfterMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ role: 'assistant' }),
      'user-1'
    )
    expect(orchestrateGenerationMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ role: 'assistant' }),
      { operationType: 'regenerate' }
    )
  })

  it('serializes alternative replies for picture sessions', async () => {
    const pictureSession: Session = {
      id: 'session-1',
      name: 'Picture Session',
      type: 'picture',
      messages: [],
    }
    let releaseSecondSessionRead = (_session: Session) => {}
    const secondSessionGate = new Promise<Session>((resolve) => {
      releaseSecondSessionRead = resolve
    })
    let markSecondSessionRead = () => {}
    const secondSessionRead = new Promise<void>((resolve) => {
      markSecondSessionRead = resolve
    })
    getSessionMock
      .mockResolvedValueOnce(pictureSession)
      .mockResolvedValueOnce(pictureSession)
      .mockImplementationOnce(async () => {
        const session = await secondSessionGate
        markSecondSessionRead()
        return session
      })
      .mockResolvedValue(pictureSession)
    createInactiveForkMock.mockResolvedValue(null)
    let finishFirst = () => {}
    const firstGeneration = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    orchestratePictureGenerationMock.mockReturnValueOnce(firstGeneration).mockResolvedValueOnce(undefined)

    const first = generateMore('session-1', 'user-1')
    await vi.waitFor(() => expect(orchestratePictureGenerationMock).toHaveBeenCalledOnce())

    const second = generateMore('session-1', 'user-1')
    releaseSecondSessionRead(pictureSession)
    await secondSessionRead

    expect(insertMessageAfterMock).toHaveBeenCalledOnce()
    expect(orchestratePictureGenerationMock).toHaveBeenCalledOnce()

    finishFirst()
    await Promise.all([first, second])

    expect(insertMessageAfterMock).toHaveBeenCalledTimes(2)
    expect(orchestratePictureGenerationMock).toHaveBeenCalledTimes(2)
  })
})
