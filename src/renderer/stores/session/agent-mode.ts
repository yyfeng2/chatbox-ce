import type { AgentModeEntry, AgentModeLockReason, AgentModeValue, Session } from '@shared/types'
import { useMemo } from 'react'
import * as chatStore from '../chatStore'
import { uiStore, useUIStore } from '../uiStore'

export function createDefaultAgentModeEntry(smartSwitchingDefault = uiStore.getState().agentModeSmartSwitchingDefault) {
  return {
    value: smartSwitchingDefault ? 'auto' : 'off',
    locked: false,
    lockReason: null,
  } satisfies AgentModeEntry
}

export function getSessionAgentModeFromSession(
  session: Pick<Session, 'settings'> | null | undefined
): AgentModeEntry | undefined {
  return session?.settings?.agentMode
}

export function getSessionAgentModeEntry(
  sessionId: string,
  session?: Pick<Session, 'settings'> | null,
  legacyMap = uiStore.getState().sessionAgentModeMap
): AgentModeEntry {
  return getSessionAgentModeFromSession(session) ?? legacyMap[sessionId] ?? createDefaultAgentModeEntry()
}

export function useSessionAgentMode(sessionId: string): AgentModeEntry {
  const legacyMap = useUIStore((state) => state.sessionAgentModeMap)
  const smartSwitchingDefault = useUIStore((state) => state.agentModeSmartSwitchingDefault)
  const { session } = chatStore.useSession(sessionId === 'new' ? null : sessionId)

  return useMemo(() => {
    return (
      getSessionAgentModeFromSession(session) ??
      legacyMap[sessionId] ??
      createDefaultAgentModeEntry(smartSwitchingDefault)
    )
  }, [legacyMap, session, sessionId, smartSwitchingDefault])
}

function setNewSessionAgentMode(value: AgentModeValue): AgentModeEntry {
  const current = uiStore.getState().sessionAgentModeMap.new
  if (current?.locked && value !== 'on') return current
  const next: AgentModeEntry = { value, locked: current?.locked ?? false, lockReason: current?.lockReason ?? null }
  uiStore.setState((state) => ({
    sessionAgentModeMap: {
      ...state.sessionAgentModeMap,
      new: next,
    },
  }))
  return next
}

function lockNewSessionAgentMode(reason: Exclude<AgentModeLockReason, null>): AgentModeEntry {
  const next: AgentModeEntry = { value: 'on', locked: true, lockReason: reason }
  uiStore.setState((state) => ({
    sessionAgentModeMap: {
      ...state.sessionAgentModeMap,
      new: next,
    },
  }))
  return next
}

function requireSession<T extends Pick<Session, 'settings'>>(session: T | null | undefined): T {
  if (!session) {
    throw new Error('Session not found')
  }
  return session
}

function applyAgentMode<T extends Pick<Session, 'settings'>>(
  session: T | null | undefined,
  agentMode: AgentModeEntry
): T {
  const current = requireSession(session)
  return {
    ...current,
    settings: {
      ...(current.settings || {}),
      agentMode,
    },
  } as T
}

function resolveSetAgentMode<T extends Pick<Session, 'settings'>>(
  sessionId: string,
  session: T | null | undefined,
  value: AgentModeValue
): { session: T; entry: AgentModeEntry } {
  const currentSession = requireSession(session)
  const current = getSessionAgentModeEntry(sessionId, currentSession)
  if (current.locked && value !== 'on') {
    return { session: currentSession, entry: current }
  }
  const entry: AgentModeEntry = { value, locked: current.locked, lockReason: current.lockReason }
  return { session: applyAgentMode(currentSession, entry), entry }
}

export async function setSessionAgentMode(sessionId: string, value: AgentModeValue): Promise<AgentModeEntry> {
  if (sessionId === 'new') {
    return setNewSessionAgentMode(value)
  }

  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return createDefaultAgentModeEntry()
  }

  let next = getSessionAgentModeEntry(sessionId, session)
  if (next.locked && value !== 'on') return next

  chatStore.updateSessionCacheSync(sessionId, (currentSession) => {
    const resolved = resolveSetAgentMode(sessionId, currentSession, value)
    next = resolved.entry
    return resolved.session
  })

  await chatStore.updateSession(sessionId, (currentSession) => {
    const resolved = resolveSetAgentMode(sessionId, currentSession, value)
    next = resolved.entry
    return resolved.session
  })
  uiStore.getState().clearSessionAgentMode(sessionId)
  return next
}

export async function lockSessionAgentMode(
  sessionId: string,
  reason: Exclude<AgentModeLockReason, null>
): Promise<AgentModeEntry> {
  if (sessionId === 'new') {
    return lockNewSessionAgentMode(reason)
  }

  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return { value: 'on', locked: true, lockReason: reason }
  }

  const next: AgentModeEntry = { value: 'on', locked: true, lockReason: reason }
  chatStore.updateSessionCacheSync(sessionId, (currentSession) => applyAgentMode(currentSession, next))
  await chatStore.updateSession(sessionId, (currentSession) => applyAgentMode(currentSession, next))
  uiStore.getState().clearSessionAgentMode(sessionId)
  return next
}
