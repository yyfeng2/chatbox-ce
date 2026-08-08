import type { AgentModeValue } from '@shared/types'
import { IconBriefcase, IconMessageCircle } from '@tabler/icons-react'

interface AgentModeStatusIconProps {
  mode: AgentModeValue
  size: number
  className?: string
}

/**
 * Status icon for a chat/work mode: a briefcase for work mode, a chat bubble otherwise.
 * Shared between the composer button badge and the mode buttons inside the panel so
 * the icon vocabulary stays learnable when the button only shows an icon.
 */
export default function AgentModeStatusIcon({ mode, size, className = '' }: AgentModeStatusIconProps) {
  const StatusIcon = mode === 'on' ? IconBriefcase : IconMessageCircle

  return (
    <StatusIcon
      aria-hidden
      size={size}
      strokeWidth={2.4}
      className={`rounded-full ${className}`}
      data-agent-mode-status={mode}
    />
  )
}
