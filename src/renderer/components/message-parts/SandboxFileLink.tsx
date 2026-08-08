import { IconFileDownload, IconLoader } from '@tabler/icons-react'
import clsx from 'clsx'
import { type FC, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SandboxLinkTarget } from './sandbox-link'

type RescueState = 'idle' | 'saving' | 'unavailable'

// Sentinel error returned by the main-process export handler when the user closes the
// save dialog without picking a destination (see ToolCallPartUI for the same contract).
const SAVE_DIALOG_CANCELLED = 'Save dialog cancelled'

// Chips re-mount constantly (streaming re-renders, list virtualization), so dedupe the
// "shown" telemetry per session+path for the lifetime of the app run.
const shownTracked = new Set<string>()

function trackDeadLink(action: 'shown' | 'rescue_success' | 'rescue_failed') {
  // Dynamic import keeps this presentation component (and the Markdown SSR path) free of
  // the analytics/settings module graph.
  void import('@/utils/track').then(({ trackEvent }) => trackEvent('sandbox_dead_link', { action })).catch(() => {})
}

/**
 * Inline replacement for hallucinated sandbox "download links" (sandbox:/mnt/data/...).
 * The href is not a real URL, so instead of a dead anchor this chip tries to rescue the
 * file from the session sandbox on click: persist it to durable artifact storage, then
 * open the save dialog. When the file is gone (sandbox evicted) it degrades to a clearly
 * disabled state instead of silently doing nothing.
 */
export const SandboxFileLink: FC<{
  target: SandboxLinkTarget
  sessionId?: string
  children?: ReactNode
}> = ({ target, sessionId, children }) => {
  const { t } = useTranslation()
  const [state, setState] = useState<RescueState>('idle')
  const [exportError, setExportError] = useState<string | null>(null)
  // Synchronous re-entrancy guard: the `saving` render state only updates after a
  // re-render, so rapid double-clicks would otherwise start concurrent rescue flows
  // (duplicate persist calls and overlapping save dialogs).
  const rescueInFlightRef = useRef(false)
  // Markdown re-parses during streaming and the message list is virtualized, so the chip
  // can unmount mid-rescue; drop state updates that would land on an unmounted instance.
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const key = `${sessionId ?? ''}:${target.rawPath}`
    if (shownTracked.has(key)) return
    shownTracked.add(key)
    trackDeadLink('shown')
  }, [sessionId, target.rawPath])

  const handleClick = useCallback(async () => {
    if (rescueInFlightRef.current) return
    rescueInFlightRef.current = true
    setState('saving')
    setExportError(null)
    const safeSetState = (next: RescueState) => {
      if (mountedRef.current) setState(next)
    }
    try {
      const platform = (await import('@/platform')).default
      if (sessionId && platform.sandboxPersistArtifact && platform.sandboxExportFile) {
        for (const candidate of target.sandboxPathCandidates) {
          const persisted = await platform
            .sandboxPersistArtifact({ sandboxPath: candidate, sessionId, displayName: target.fileName })
            .catch(() => null)
          if (!persisted?.success || !persisted.artifactPath) continue
          const exported = await platform.sandboxExportFile({
            sandboxPath: persisted.artifactPath,
            suggestedName: target.fileName,
          })
          // A cancelled save dialog still counts as a successful rescue — the file was
          // found and persisted, and the chip stays clickable for another try. Any other
          // export failure (e.g. unwritable destination) must not report success: keep
          // the chip clickable and surface the error.
          if (exported.success || exported.error === SAVE_DIALOG_CANCELLED) {
            trackDeadLink('rescue_success')
          } else {
            trackDeadLink('rescue_failed')
            if (mountedRef.current) setExportError(exported.error || t('Export failed'))
          }
          safeSetState('idle')
          return
        }
      }
      trackDeadLink('rescue_failed')
      safeSetState('unavailable')
    } catch (err) {
      console.error('Failed to rescue sandbox file link:', err)
      trackDeadLink('rescue_failed')
      safeSetState('unavailable')
    } finally {
      rescueInFlightRef.current = false
    }
  }, [sessionId, target, t])

  const unavailable = state === 'unavailable'
  const saving = state === 'saving'

  return (
    <span
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      title={unavailable ? t('File no longer available') || '' : target.rawPath}
      className={clsx(
        'inline-flex max-w-full items-center gap-1 rounded-sm bg-chatbox-background-secondary px-1.5 py-0.5 mx-0.5 align-[-3px] text-[0.9em] font-medium',
        unavailable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!unavailable && !saving) void handleClick()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        if (!unavailable && !saving) void handleClick()
      }}
    >
      {saving ? (
        <IconLoader size={13} className="shrink-0 animate-spin" color="var(--chatbox-tint-brand)" />
      ) : (
        <IconFileDownload
          size={13}
          className="shrink-0"
          color={unavailable ? 'var(--chatbox-tint-tertiary)' : 'var(--chatbox-tint-brand)'}
        />
      )}
      <span className="truncate">{children ?? target.fileName}</span>
      {unavailable && <span className="shrink-0 text-[0.85em] opacity-75">({t('File no longer available')})</span>}
      {!unavailable && exportError && (
        <span className="shrink-0 text-[0.85em] text-red-600 dark:text-red-400">({exportError})</span>
      )}
    </span>
  )
}
