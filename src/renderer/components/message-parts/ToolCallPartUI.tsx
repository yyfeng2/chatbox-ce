import NiceModal from '@ebay/nice-modal-react'
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Code,
  Collapse,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import { isApprovalPauseReason } from '@shared/message-approval'
import { SANDBOX_EXEC_ERROR_CODES } from '@shared/sandbox-provider'
import type {
  ImageGenerationApprovalDetails,
  Message,
  MessageReasoningPart,
  MessageTextPart,
  MessageToolCallPart,
} from '@shared/types'
import {
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconCircleXFilled,
  IconCode,
  IconCopy,
  IconDatabase,
  IconDeviceFloppy,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFile,
  IconFileMinus,
  IconFileSearch,
  IconFolderSearch,
  IconInfoCircle,
  IconLoader,
  IconMessage,
  IconPhoto,
  IconPlayerPlay,
  IconSparkles,
  IconTerminal,
  IconWorld,
  IconWriting,
  IconX,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { type FC, type ReactNode, type Ref, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { useBlob } from '@/hooks/useBlob'
import { formatElapsedTime, MIN_STEP_DURATION_MS, useThinkingTimer } from '@/hooks/useThinkingTimer'
import { getLogger } from '@/lib/utils'
import { getToolName } from '@/packages/tools'
import type { SearchResultItem } from '@/packages/web-search'
import platform from '@/platform'
import {
  registerApprovalActionsElement,
  setApprovalActionsVisible,
  unregisterApprovalActionsElement,
  useApprovalCardHighlighted,
} from '@/stores/approvalAttentionStore'
import {
  continuePausedToolCall,
  disableToolCallLimitPauseAndContinue,
  stopPausedToolCall,
} from '@/stores/sessionActions'
import * as toastActions from '@/stores/toastActions'
import { useUIStore } from '@/stores/uiStore'
import { inlineSandboxHtmlAssets } from './html-artifact-assets'
import { getLocalFileName, localFilePathToUrl } from './local-file-url'

// ─── Tool Error Result ──────────────────────────────────────────────

const log = getLogger('tool-call-part-ui')

const TOOL_ERROR_PREVIEW_LENGTH = 1_200
const TOOL_PAYLOAD_PREVIEW_LENGTH = 8_000
const APPROVAL_PAYLOAD_MAX_HEIGHT = 'min(240px, 35vh)'
const GIT_BASH_DOWNLOAD_URL = 'https://git-scm.com/downloads/win'
const WSL_INSTALL_URL = 'https://learn.microsoft.com/windows/wsl/install'

function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n\n...`
}

function stringifyToolPayload(payload: unknown, maxLength = TOOL_PAYLOAD_PREVIEW_LENGTH): string {
  let text: string
  try {
    text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  } catch {
    text = String(payload)
  }
  return truncatePreview(text, maxLength)
}

function isBashNotAvailableResult(part: MessageToolCallPart): boolean {
  if (part.state !== 'result') return false
  const result = part.result as { errorCode?: unknown } | undefined
  return result?.errorCode === SANDBOX_EXEC_ERROR_CODES.BASH_NOT_AVAILABLE
}

const BashNotAvailableNotice: FC = () => {
  const { t } = useTranslation()
  return (
    <Alert
      color="yellow"
      variant="light"
      icon={<IconInfoCircle size={17} />}
      title={t('Bash is not available on this Windows device.')}
    >
      <Stack gap="xs">
        <Text size="sm">
          {t(
            'Install Git Bash or enable WSL to run Bash code. You can continue using Node.js code execution without either.'
          )}
        </Text>
        <Group gap="xs">
          <Button
            size="compact-xs"
            variant="light"
            rightSection={<IconExternalLink size={12} />}
            onClick={() => platform.openLink(GIT_BASH_DOWNLOAD_URL)}
          >
            {t('Download Git Bash')}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            rightSection={<IconExternalLink size={12} />}
            onClick={() => platform.openLink(WSL_INSTALL_URL)}
          >
            {t('How to install WSL2')}
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

function extractToolError(part: MessageToolCallPart): { errorCode?: number; errorText?: string } {
  if (part.state !== 'error') return {}
  const result = part.result as { error?: unknown; errorCode?: unknown } | undefined
  const errorCode = typeof result?.errorCode === 'number' ? result.errorCode : undefined
  const errorText =
    result?.error === undefined ? undefined : stringifyToolPayload(result.error, TOOL_ERROR_PREVIEW_LENGTH)
  return { errorCode, errorText }
}

const ToolCallErrorDetails: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const { errorText } = extractToolError(part)
  return (
    <Text size="sm" c="chatbox-error">
      {errorText || t('Tool call failed')}
    </Text>
  )
}

// Auto-expand a step when it needs attention (paused / waiting for approval) and
// auto-collapse once that resolves — e.g. after the user clicks Continue/Approve/Stop/Deny.
// Only the transition edges drive expansion; a stable signal leaves the user's manual
// toggle untouched.
function useAutoExpandOnSignal(signal: boolean): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [expanded, setExpanded] = useState(signal)
  const prevSignal = useRef(signal)
  useEffect(() => {
    if (signal && !prevSignal.current) {
      setExpanded(true) // became active → reveal the action buttons
    } else if (!signal && prevSignal.current) {
      setExpanded(false) // resolved → collapse the tool call
    }
    prevSignal.current = signal
  }, [signal])
  return [expanded, setExpanded]
}

// Report whether a pending approval's Approve/Deny actions are visible in the viewport,
// so the floating approval pill above the input box appears whenever they are not.
// Observed on the actions row (not the whole card): a tall card whose buttons are
// scrolled off-screen still needs the pill. Unmounting (virtualized list) and a
// collapsed step (zero height) both count as not visible. Also registers the element
// so the pill's "View" action can scroll to it. Keyed per component instance because
// the same card can be mounted twice (message list + search dialog).
function useApprovalCardVisibilityReport(toolCallId: string, enabled: boolean) {
  const instanceId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element) return
    registerApprovalActionsElement(toolCallId, instanceId, element)
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      setApprovalActionsVisible(toolCallId, instanceId, entry?.isIntersecting ?? false)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      unregisterApprovalActionsElement(toolCallId, instanceId)
      setApprovalActionsVisible(toolCallId, instanceId, false)
    }
  }, [toolCallId, instanceId, enabled])
  return ref
}

// ─── Tool Icon Mapping ──────────────────────────────────────────────

const toolIconMap: Record<string, React.ElementType> = {
  web_search: IconWorld,
  terminal: IconTerminal,
  code_search: IconFileSearch,
  file_search: IconFileSearch,
  query_knowledge_base: IconDatabase,
  parse_link: IconExternalLink,
  create_file: IconFile,
  edit_file: IconEdit,
  delete_file: IconFileMinus,
  write_file: IconWriting,
  search_files: IconFileSearch,
  list_files: IconFileSearch,
  get_files_meta: IconFileSearch,
  read_file_chunks: IconFile,
  read_file: IconFile,
  code_execution: IconPlayerPlay,
  parse_file: IconFile,
  create_download: IconDownload,
  search_file_content: IconFileSearch,
  sandbox_bash: IconTerminal,
  sandbox_read: IconFile,
  sandbox_write: IconWriting,
  sandbox_edit: IconEdit,
  sandbox_grep: IconFileSearch,
  sandbox_ls: IconFolderSearch,
  sandbox_find: IconFolderSearch,
  load_skill: IconSparkles,
  user_exec: IconTerminal,
}

const getToolIcon = (toolName: string) => toolIconMap[toolName] || IconCode
const TIMELINE_NODE_SIZE = 24
const TIMELINE_NODE_TOP = 2
const TIMELINE_NODE_CENTER = TIMELINE_NODE_TOP + TIMELINE_NODE_SIZE / 2
const TIMELINE_STACK_GAP = 8

const InlineToolIcon: FC<{
  icon: React.ElementType
  size: number
  color?: string
  className?: string
}> = ({ icon: Icon, size, color, className }) => (
  <Box
    component="span"
    className={clsx('inline-flex shrink-0 items-center justify-center leading-none', className)}
    style={{ width: size, height: size, color }}
  >
    <Icon size={size} color={color} style={{ display: 'block' }} />
  </Box>
)

// ─── Pill Header (shared) ───────────────────────────────────────────

const ToolCallPill: FC<{
  part: MessageToolCallPart
  summary?: string
  onClick: () => void
  expanded: boolean
}> = ({ part, summary, onClick, expanded }) => {
  const Icon = getToolIcon(part.toolName)
  const isLoading = part.state === 'call'
  const isError = part.state === 'error' || isBashNotAvailableResult(part)

  const bgColor = isError
    ? 'color-mix(in srgb, var(--chatbox-tint-error) 8%, transparent)'
    : 'var(--chatbox-background-gray-secondary)'

  const iconColor = isLoading
    ? 'var(--chatbox-tint-brand)'
    : isError
      ? 'var(--chatbox-tint-error)'
      : 'var(--chatbox-tint-success)'

  return (
    <UnstyledButton onClick={onClick} style={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}>
      <Group
        gap={6}
        px={10}
        py={2}
        align="center"
        wrap="nowrap"
        style={{
          borderRadius: 'var(--mantine-radius-xl)',
          backgroundColor: bgColor,
          display: 'inline-flex',
          maxWidth: '100%',
        }}
      >
        <InlineToolIcon icon={Icon} size={13} color={iconColor} />
        <Text size="xs" fw={500} c={isError ? 'chatbox-error' : undefined} lh="13px" truncate="end">
          {getToolName(part.toolName, part.args)}
        </Text>
        {isLoading ? (
          <InlineToolIcon icon={IconLoader} size={11} color="var(--chatbox-tint-brand)" className="animate-spin" />
        ) : isError ? (
          <InlineToolIcon icon={IconCircleXFilled} size={11} color="var(--chatbox-tint-error)" />
        ) : (
          <>
            <InlineToolIcon icon={IconCheck} size={11} color="var(--chatbox-tint-success)" />
            {summary && (
              <Text size="xs" c="chatbox-tertiary" lh="13px" truncate="end" style={{ minWidth: 0 }}>
                · {summary}
              </Text>
            )}
          </>
        )}
        {!isLoading && (
          <InlineToolIcon
            icon={IconChevronDown}
            size={11}
            color="var(--chatbox-tertiary)"
            className={clsx('transition-transform', expanded ? 'rotate-180' : '')}
          />
        )}
      </Group>
    </UnstyledButton>
  )
}

// ─── Web Search ─────────────────────────────────────────────────────

function extractSearchResults(part: MessageToolCallPart): SearchResultItem[] {
  const result = part.result as Record<string, unknown> | undefined
  if (!result || typeof result !== 'object') return []
  const items = result.searchResults
  if (!Array.isArray(items)) return []
  return items.filter(
    (item): item is SearchResultItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.title === 'string' &&
      typeof item.link === 'string' &&
      typeof item.snippet === 'string'
  )
}

const getSafeExternalHref = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    return new URL(trimmed).toString()
  } catch (_error) {
    const encoded = trimmed.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')
    try {
      return new URL(encoded).toString()
    } catch (_innerError) {
      return null
    }
  }
}

const SearchResultCard: FC<{ index: number; result: SearchResultItem }> = ({ index, result }) => {
  const href = getSafeExternalHref(result.link)

  const content = (
    <Paper
      radius="md"
      p={8}
      bg="var(--chatbox-background-gray-secondary)"
      w={164}
      className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
      title={result.title}
    >
      <Group gap={4} wrap="nowrap" align="flex-start">
        <Text size="xs" fw={600} className="shrink-0" m={0} lh={1.35}>
          {index + 1}.
        </Text>
        <Text size="xs" truncate="end" m={0} lh={1.35}>
          {result.title}
        </Text>
      </Group>
      <Text size="10px" truncate="end" c="chatbox-tertiary" m={0} mt={4} lh={1.25}>
        {result.link}
      </Text>
    </Paper>
  )

  if (!href) {
    return content
  }

  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" className="no-underline">
      {content}
    </Box>
  )
}

function extractSearchQueries(parts: MessageToolCallPart[]): string[] {
  const queries: string[] = []
  for (const part of parts) {
    const args = part.args as Record<string, unknown> | undefined
    const query = args?.query
    if (typeof query === 'string' && query.trim()) {
      queries.push(query.trim())
    }
  }
  return queries
}

export const WebSearchGroupUI: FC<{ parts: MessageToolCallPart[] }> = ({ parts }) => {
  const { t } = useTranslation()
  const allResults = parts.flatMap((part) => extractSearchResults(part))
  const queries = extractSearchQueries(parts)
  const hasLoading = parts.some((p) => p.state === 'call')
  const hasError = parts.some((p) => p.state === 'error') && !hasLoading
  const allDone = parts.every((p) => p.state === 'result' || p.state === 'error')
  const resultCount = allResults.length
  const noResults = allDone && !hasError && resultCount === 0
  const summary =
    resultCount > 0 ? t('{{count}} results', { count: resultCount }) : noResults ? t('Search unsuccessful') : undefined

  const isFailState = hasError || noResults
  const [expanded, setExpanded] = useAutoExpandOnSignal(false)
  const errorPart = hasError ? parts.find((p) => p.state === 'error') : undefined
  const bgColor = isFailState
    ? 'var(--chatbox-background-gray-secondary)'
    : expanded
      ? 'var(--chatbox-background-brand-secondary)'
      : 'var(--chatbox-background-gray-secondary)'
  const border = isFailState ? 'none' : expanded ? '1px solid var(--chatbox-border-brand)' : 'none'

  return (
    <Stack gap={4} mb={4}>
      <UnstyledButton
        onClick={resultCount > 0 || queries.length > 0 || hasError ? () => setExpanded((prev) => !prev) : undefined}
      >
        <Group
          gap={4}
          px={8}
          py={8}
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: bgColor,
            border,
            display: 'inline-flex',
          }}
        >
          <IconWorld size={16} color="var(--chatbox-tint-success)" style={{ flexShrink: 0 }} />
          <Text size="sm" fw={600} c="chatbox-secondary" lh={1}>
            {getToolName('web_search')}
          </Text>
          {hasLoading ? (
            <IconLoader
              size={16}
              className="animate-spin"
              color="var(--chatbox-tint-brand)"
              style={{ flexShrink: 0 }}
            />
          ) : isFailState ? (
            <>
              {summary && (
                <Text size="xs" c="chatbox-tertiary" lh={1}>
                  {summary}
                </Text>
              )}
              <IconX size={16} color="var(--chatbox-tint-error)" style={{ flexShrink: 0 }} />
            </>
          ) : (
            <>
              {summary && (
                <Text size="xs" c="chatbox-tertiary" lh={1}>
                  {summary}
                </Text>
              )}
              {allDone && <IconCheck size={16} color="var(--chatbox-tint-success)" style={{ flexShrink: 0 }} />}
            </>
          )}
        </Group>
      </UnstyledButton>
      {expanded && queries.length > 0 && (
        <Group gap={4} ml={4}>
          {queries.map((query, index) => (
            <Text key={`${index}-${query}`} size="xs" c="chatbox-tertiary" fs="italic" lh={1.4}>
              "{query}"{index < queries.length - 1 && ','}
            </Text>
          ))}
        </Group>
      )}
      {expanded && allResults.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
          {allResults.map((result, index) => (
            <SearchResultCard key={`${index}-${result.link}`} index={index} result={result} />
          ))}
        </div>
      )}
      {expanded && errorPart && (
        <Box ml={4} pl="sm" style={{ borderLeft: '1px solid var(--chatbox-tint-error)' }}>
          <ToolCallErrorDetails part={errorPart} />
        </Box>
      )}
    </Stack>
  )
}

// ─── Parse Link ─────────────────────────────────────────────────────

const ParseLinkUI: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const isLoading = part.state === 'call'
  const isError = part.state === 'error'
  const [expanded, setExpanded] = useAutoExpandOnSignal(false)
  const result = part.result as Record<string, unknown> | undefined
  const title = (result?.title as string) || ''
  const content = (result?.content as string) || ''
  const url = (result?.url as string) || ((part.args as Record<string, unknown>)?.url as string) || ''

  const bgColor = isError
    ? 'color-mix(in srgb, var(--chatbox-tint-error) 8%, transparent)'
    : expanded
      ? 'var(--chatbox-background-brand-secondary)'
      : 'var(--chatbox-background-gray-secondary)'
  const border = isError
    ? '1px solid var(--chatbox-border-error)'
    : expanded
      ? '1px solid var(--chatbox-border-brand)'
      : 'none'

  return (
    <Stack gap={4} mb={4}>
      <UnstyledButton onClick={() => setExpanded((prev) => !prev)}>
        <Group
          gap={4}
          px={8}
          py={8}
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: bgColor,
            border,
            display: 'inline-flex',
          }}
        >
          <IconExternalLink size={16} color="var(--chatbox-tint-success)" style={{ flexShrink: 0 }} />
          <Text size="sm" fw={600} c={isError ? 'chatbox-error' : 'chatbox-secondary'} lh={1}>
            {getToolName(part.toolName, part.args)}
          </Text>
          {isLoading ? (
            <IconLoader
              size={16}
              className="animate-spin"
              color="var(--chatbox-tint-brand)"
              style={{ flexShrink: 0 }}
            />
          ) : isError ? (
            <IconCircleXFilled size={16} color="var(--chatbox-tint-error)" style={{ flexShrink: 0 }} />
          ) : (
            <>
              {title && (
                <Text size="xs" c="chatbox-tertiary" lh={1} truncate="end" maw={300}>
                  {title}
                </Text>
              )}
              <IconCheck size={16} color="var(--chatbox-tint-success)" style={{ flexShrink: 0 }} />
            </>
          )}
        </Group>
      </UnstyledButton>
      {expanded && (isError || content) && (
        <Box
          mt={4}
          pl="sm"
          style={{
            borderLeft: `1px solid ${isError ? 'var(--chatbox-tint-error)' : 'var(--chatbox-tint-placeholder)'}`,
            maxHeight: 400,
            overflowY: 'auto',
            marginLeft: 7,
          }}
        >
          {url && (
            <Text size="xs" c="chatbox-tertiary" mb={4}>
              {url}
            </Text>
          )}
          {isError ? (
            <ToolCallErrorDetails part={part} />
          ) : (
            <Text size="sm" c="chatbox-tertiary" style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              {content}
            </Text>
          )}
        </Box>
      )}
    </Stack>
  )
}

const ParseLinkDetails: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const isError = part.state === 'error'
  const result = part.result as Record<string, unknown> | undefined
  const content = (result?.content as string) || ''
  const url = (result?.url as string) || ((part.args as Record<string, unknown>)?.url as string) || ''

  return (
    <Stack gap={6}>
      {url && (
        <Text size="xs" c="chatbox-tertiary">
          {url}
        </Text>
      )}
      {isError ? (
        <ToolCallErrorDetails part={part} />
      ) : (
        content && (
          <Text size="sm" c="chatbox-tertiary" style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {content}
          </Text>
        )
      )}
    </Stack>
  )
}

// ─── General Tool Call ──────────────────────────────────────────────

const GeneralToolCallUI: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const isBashNotAvailable = isBashNotAvailableResult(part)
  const isError = part.state === 'error' || isBashNotAvailable
  const [expanded, setExpanded] = useAutoExpandOnSignal(isBashNotAvailable)

  return (
    <Stack gap={6} mb="xs">
      <ToolCallPill part={part} onClick={() => setExpanded((prev) => !prev)} expanded={expanded} />
      <Collapse in={expanded}>
        <Box
          ml={4}
          pl="sm"
          style={{
            borderLeft: `2px solid ${isError ? 'var(--chatbox-tint-error)' : 'var(--chatbox-tint-success)'}`,
          }}
        >
          <GeneralToolCallDetails part={part} />
        </Box>
      </Collapse>
    </Stack>
  )
}

const GeneralToolCallDetails: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const isError = part.state === 'error'
  const isBashNotAvailable = isBashNotAvailableResult(part)

  return (
    <Stack gap="xs">
      <Box>
        <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
          {t('Arguments')}
        </Text>
        <Code block>{stringifyToolPayload(part.args)}</Code>
      </Box>
      {isError ? (
        <Box>
          <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
            {t('Error')}
          </Text>
          <ToolCallErrorDetails part={part} />
        </Box>
      ) : isBashNotAvailable ? (
        <BashNotAvailableNotice />
      ) : (
        !!part.result && (
          <Box>
            <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
              {t('Result')}
            </Text>
            <Code block>{stringifyToolPayload(part.result)}</Code>
          </Box>
        )
      )}
    </Stack>
  )
}

// ─── Create Download ─────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const HTML_EXTENSIONS = new Set(['.html', '.htm'])

function getFileExtension(filePath: string): string {
  const name = getLocalFileName(filePath)
  const dotIndex = name.lastIndexOf('.')
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : ''
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filePath))
}

function isHtmlFile(filePath: string): boolean {
  return HTML_EXTENSIONS.has(getFileExtension(filePath))
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const CreateDownloadUI: FC<{ part: MessageToolCallPart } & ToolCallActionContext> = ({
  part,
  sessionId,
  messageId,
}) => {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const setPictureShow = useUIStore((s) => s.setPictureShow)
  const isLoading = part.state === 'call'
  const isError = part.state === 'error'
  const result = part.result as Record<string, unknown> | undefined
  const filePath = (result?.file_path as string) || ((part.args as Record<string, unknown>)?.file_path as string) || ''
  const fileName = filePath ? getLocalFileName(filePath) : 'File'
  const isDownloadable = result?.downloadable === true
  const isSandboxPath = filePath.includes('/chatbox-sandbox/') || filePath.includes('\\chatbox-sandbox\\')
  const canPreview = isDownloadable && !!filePath && isImageFile(filePath) && isSandboxPath
  const canPreviewHtml = isDownloadable && !!filePath && isHtmlFile(filePath) && isSandboxPath
  const imageUrl = canPreview ? localFilePathToUrl(filePath) : null

  const handleSave = useCallback(async () => {
    if (!filePath) return
    setSaving(true)
    setSaveError(null)
    try {
      const platform = (await import('@/platform')).default
      if (platform.sandboxExportFile) {
        const res = await platform.sandboxExportFile({ sandboxPath: filePath })
        if (!res.success && res.error && res.error !== 'Save dialog cancelled') {
          setSaveError(res.error)
        }
      }
    } catch (err) {
      console.error('Failed to export file:', err)
      setSaveError(t('File no longer available'))
    } finally {
      setSaving(false)
    }
  }, [filePath, t])

  const handlePreviewHtml = useCallback(async () => {
    if (!filePath) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const platform = (await import('@/platform')).default
      if (!platform.sandboxReadFileBase64) {
        setPreviewError(t('Preview not available'))
        return
      }
      if (platform.sandboxCreateHtmlPreview) {
        const preview = await platform.sandboxCreateHtmlPreview({ filePath })
        if (preview.success && preview.url) {
          await NiceModal.show('artifact-preview', {
            htmlCode: '',
            previewUrl: preview.url,
            sandboxPath: filePath,
            sessionId,
            uniqueId: messageId ? `${messageId}-tool-${part.toolCallId}` : undefined,
          })
          return
        }
      }
      const res = await platform.sandboxReadFileBase64({ filePath })
      if (!res.success || !res.base64) {
        setPreviewError(res.error || t('Preview not available'))
        return
      }
      const htmlCode = await inlineSandboxHtmlAssets(decodeBase64Utf8(res.base64), filePath, (assetPath) => {
        if (!platform.sandboxReadFileBase64) {
          return Promise.resolve({ success: false })
        }
        return platform.sandboxReadFileBase64({ filePath: assetPath })
      })
      await NiceModal.show('artifact-preview', {
        htmlCode,
        sessionId,
        uniqueId: messageId ? `${messageId}-tool-${part.toolCallId}` : undefined,
      })
    } catch (err) {
      console.error('Failed to preview HTML artifact:', err)
      setPreviewError(t('Preview not available'))
    } finally {
      setPreviewing(false)
    }
  }, [filePath, messageId, part.toolCallId, sessionId, t])

  if (isLoading) {
    return (
      <Group gap={6} mb="xs">
        <IconLoader size={14} className="animate-spin" color="var(--chatbox-tint-brand)" />
        <Text size="sm" c="chatbox-tertiary">
          {t('Preparing file...')}
        </Text>
      </Group>
    )
  }

  if (isError || !isDownloadable) {
    return <GeneralToolCallUI part={part} />
  }

  return (
    <Stack gap={6} mb="xs">
      {imageUrl && !previewFailed && (
        <Box
          style={{
            maxWidth: 400,
            borderRadius: 'var(--mantine-radius-md)',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
          onClick={() => setPictureShow({ picture: { url: imageUrl } })}
        >
          <img
            src={imageUrl}
            alt={fileName}
            style={{ display: 'block', width: '100%', height: 'auto' }}
            onError={() => setPreviewFailed(true)}
          />
        </Box>
      )}
      {previewFailed && canPreview && (
        <Text size="xs" c="dimmed">
          {t('Preview not available')}
        </Text>
      )}
      <Paper
        radius="md"
        p="xs"
        bg="var(--chatbox-background-gray-secondary)"
        style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}
      >
        <IconFile size={18} color="var(--chatbox-tint-brand)" style={{ flexShrink: 0 }} />
        <Text size="sm" fw={500} truncate title={filePath} style={{ flex: '1 1 0', minWidth: 0 }}>
          {fileName}
        </Text>
        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
          {canPreviewHtml && (
            <Button
              variant="light"
              size="compact-xs"
              leftSection={<IconEye size={14} />}
              loading={previewing}
              onClick={handlePreviewHtml}
            >
              {t('Preview')}
            </Button>
          )}
          <Button
            variant="light"
            size="compact-xs"
            leftSection={<IconDeviceFloppy size={14} />}
            loading={saving}
            onClick={handleSave}
          >
            {t('Save')}
          </Button>
        </Group>
      </Paper>
      {saveError && (
        <Text size="xs" c="red">
          {saveError}
        </Text>
      )}
      {previewError && (
        <Text size="xs" c="red">
          {previewError}
        </Text>
      )}
    </Stack>
  )
}

function isDownloadArtifact(part: MessageToolCallPart): boolean {
  if (part.toolName !== 'create_download' || part.state !== 'result') return false
  const result = part.result as Record<string, unknown> | undefined
  return result?.downloadable === true
}

export const DownloadArtifactsUI: FC<{ parts: MessageToolCallPart[] } & ToolCallActionContext> = ({
  parts,
  sessionId,
  messageId,
}) => {
  const { t } = useTranslation()
  const artifacts = parts.filter(isDownloadArtifact)

  if (artifacts.length === 0) return null

  return (
    <Stack
      gap={6}
      mt={10}
      pt={8}
      mb={2}
      style={{ borderTop: '1px solid color-mix(in srgb, var(--chatbox-border-primary) 70%, transparent)' }}
    >
      <Group gap={6}>
        <IconDownload size={14} color="var(--chatbox-tint-brand)" />
        <Text size="xs" fw={600} c="chatbox-secondary">
          {t('Artifacts')}
        </Text>
      </Group>
      <Stack gap={6}>
        {artifacts.map((part) => (
          <CreateDownloadUI key={part.toolCallId} part={part} sessionId={sessionId} messageId={messageId} />
        ))}
      </Stack>
    </Stack>
  )
}

// ─── User Exec ──────────────────────────────────────────────────────

function isCommandExecutionPart(part: MessageToolCallPart): boolean {
  return part.toolName === 'user_exec' || part.toolName === 'code_execution'
}

function getCommandExecutionCode(part: MessageToolCallPart): string | undefined {
  return getFirstStringValue(part.args, part.toolName === 'user_exec' ? ['command'] : ['code'])
}

function parseCommandExecutionResult(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function useCommandExecutionResult(part: MessageToolCallPart): Record<string, unknown> | undefined {
  const { data: storedResult } = useBlob(isCommandExecutionPart(part) ? part.resultStorageKey : undefined)
  return parseCommandExecutionResult(storedResult) ?? parseCommandExecutionResult(part.result)
}

const CommandExecutionDetails: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const command = getCommandExecutionCode(part)
  const result = useCommandExecutionResult(part)
  const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
  const stderr =
    typeof result?.stderr === 'string' ? result.stderr : typeof result?.error === 'string' ? result.error : ''
  const hasFinished = part.state === 'result' || part.state === 'error'

  return (
    <Stack gap="xs">
      {command && (
        <Box>
          <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
            {t('Command')}
          </Text>
          <Code block style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {command}
          </Code>
        </Box>
      )}
      {hasFinished && (
        <Box>
          <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
            stdout
          </Text>
          <Code block style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {stdout || '—'}
          </Code>
        </Box>
      )}
      {hasFinished && stderr && (
        <Box>
          <Text size="xs" c="chatbox-tertiary" fw={500} mb={2}>
            stderr
          </Text>
          <Code block style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {stderr}
          </Code>
        </Box>
      )}
    </Stack>
  )
}

const UserExecUI: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const isExecuting = part.state === 'call'
  const isError = part.state === 'error'
  const isDenied =
    part.state === 'result' && (part.result as Record<string, unknown>)?.stderr === 'Command denied by user.'

  const bgColor =
    isError || isDenied
      ? 'color-mix(in srgb, var(--chatbox-tint-error) 8%, transparent)'
      : 'var(--chatbox-background-gray-secondary)'

  return (
    <Stack gap={6} mb="xs">
      <UnstyledButton onClick={() => setExpanded((prev) => !prev)}>
        <Group
          gap={6}
          px={10}
          py={4}
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: bgColor,
            border: '1px solid transparent',
            display: 'inline-flex',
          }}
        >
          <IconTerminal
            size={13}
            color={
              isExecuting
                ? 'var(--chatbox-tint-brand)'
                : isError || isDenied
                  ? 'var(--chatbox-tint-error)'
                  : 'var(--chatbox-tint-success)'
            }
            style={{ flexShrink: 0 }}
          />
          <Text size="xs" fw={500} lh={1}>
            {getToolName(part.toolName, part.args)}
          </Text>
          {isExecuting && (
            <IconLoader
              size={11}
              className="animate-spin"
              color="var(--chatbox-tint-brand)"
              style={{ flexShrink: 0 }}
            />
          )}
          {isDenied && (
            <Text size="xs" c="chatbox-error" lh={1}>
              {t('Denied')}
            </Text>
          )}
          {part.state === 'result' && !isDenied && (
            <IconCheck size={11} color="var(--chatbox-tint-success)" style={{ flexShrink: 0 }} />
          )}
          {isError && <IconCircleXFilled size={11} color="var(--chatbox-tint-error)" style={{ flexShrink: 0 }} />}
        </Group>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Box
          ml={4}
          pl="sm"
          style={{
            borderLeft: `2px solid ${isError || isDenied ? 'var(--chatbox-tint-error)' : 'var(--chatbox-tint-success)'}`,
          }}
        >
          <CommandExecutionDetails part={part} />
        </Box>
      </Collapse>
    </Stack>
  )
}

// ─── Entry Point ────────────────────────────────────────────────────

type ToolCallActionContext = {
  sessionId?: string
  messageId?: string
}

export const ToolCallPartUI: FC<{ part: MessageToolCallPart } & ToolCallActionContext> = ({
  part,
  sessionId,
  messageId,
}) => {
  if (part.state === 'paused') {
    return <ToolCallGroupUI parts={[part]} sessionId={sessionId} messageId={messageId} />
  }
  if (part.toolName === 'web_search') {
    return <WebSearchGroupUI parts={[part]} />
  }
  if (part.toolName === 'parse_link') {
    return <ParseLinkUI part={part} />
  }
  if (part.toolName === 'create_download') {
    return <CreateDownloadUI part={part} sessionId={sessionId} messageId={messageId} />
  }
  if (part.toolName === 'user_exec') {
    return <UserExecUI part={part} />
  }
  return <GeneralToolCallUI part={part} />
}

// ─── Tool Call Timeline (consecutive tool calls) ─────────────────

function getFirstStringValue(source: unknown, keys: string[]): string | undefined {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function truncateSummary(value: string, maxLength = 56): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

const ToolCallRunningDots: FC = () => (
  <Group gap={2} wrap="nowrap" ml={2} style={{ color: 'var(--chatbox-tint-brand)' }}>
    {[0, 1, 2].map((index) => (
      <Box
        key={index}
        component="span"
        className="animate-pulse"
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: 'currentColor',
          animationDelay: `${index * 150}ms`,
        }}
      />
    ))}
  </Group>
)

// Full-size, high-salience decision buttons shared by all approval cards: the
// Approve/Deny pair is what users miss, so it carries the card's visual weight.
const APPROVAL_ACTION_BUTTON_PROPS = { size: 'sm', h: 32, px: 'lg', radius: 'xl' } as const

const ImageGenerationApprovalCard: FC<{
  toolCallId: string
  details: ImageGenerationApprovalDetails
  disabled: boolean
  onApprove: () => void
  onDeny: () => void
  actionsRef?: Ref<HTMLDivElement>
}> = ({ toolCallId, details, disabled, onApprove, onDeny, actionsRef }) => {
  const { t } = useTranslation()

  return (
    <Stack data-testid={TestId.toolCall.approvalCard} data-tool-call-id={toolCallId} gap="sm">
      <Group gap="xs" wrap="nowrap">
        <Box className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chatbox-background-brand-secondary">
          <IconPhoto size={18} color="var(--chatbox-tint-brand)" />
        </Box>
        <Box className="min-w-0">
          <Text size="sm" fw={600} c="chatbox-primary">
            {t('Generate images')}
          </Text>
          <Text size="xs" c="chatbox-tertiary" truncate="end">
            {details.provider} · {details.modelId}
          </Text>
        </Box>
      </Group>

      <Paper p="xs" radius="md" bg="var(--chatbox-background-primary)" withBorder>
        <Text size="xs" c="chatbox-tertiary" mb={3}>
          {t('Prompt')}
        </Text>
        <Box style={{ maxHeight: APPROVAL_PAYLOAD_MAX_HEIGHT, overflow: 'auto' }}>
          <Text size="sm" c="chatbox-primary" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {details.prompt}
          </Text>
        </Box>
      </Paper>

      <Group gap="lg">
        <Box>
          <Text size="xs" c="chatbox-tertiary">
            {t('Number of images')}
          </Text>
          <Text size="sm" fw={500}>
            {details.count}
          </Text>
        </Box>
        {details.aspectRatio && (
          <Box>
            <Text size="xs" c="chatbox-tertiary">
              {t('Aspect ratio')}
            </Text>
            <Text size="sm" fw={500}>
              {details.aspectRatio}
            </Text>
          </Box>
        )}
        {details.style && (
          <Box>
            <Text size="xs" c="chatbox-tertiary">
              {t('Image style')}
            </Text>
            <Text size="sm" fw={500}>
              {details.style}
            </Text>
          </Box>
        )}
      </Group>

      <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />} p="xs">
        <Stack gap={3}>
          <Text size="xs" fw={500}>
            {t('This request may incur charges from {{provider}}.', { provider: details.provider })}
          </Text>
        </Stack>
      </Alert>

      <Group gap="xs" ref={actionsRef}>
        <Button
          data-testid={TestId.toolCall.approve}
          {...APPROVAL_ACTION_BUTTON_PROPS}
          leftSection={<IconCheck size={14} stroke={2.5} />}
          color="chatbox-brand"
          disabled={disabled}
          onClick={onApprove}
        >
          {t('Approve and generate')}
        </Button>
        <Button
          data-testid={TestId.toolCall.deny}
          {...APPROVAL_ACTION_BUTTON_PROPS}
          variant="light"
          color="gray"
          disabled={disabled}
          onClick={onDeny}
        >
          {t('Cancel')}
        </Button>
      </Group>
    </Stack>
  )
}

const PausedToolCallDetails: FC<{ part: MessageToolCallPart } & ToolCallActionContext> = ({
  part,
  sessionId,
  messageId,
}) => {
  const { t } = useTranslation()
  const pauseReason = part.pauseReason
  const isApproval = isApprovalPauseReason(pauseReason)
  const approvalActionsRef = useApprovalCardVisibilityReport(part.toolCallId, isApproval)
  if (
    pauseReason?.type === 'app_action_approval' &&
    pauseReason.action === 'image.generate' &&
    pauseReason.details?.type === 'image_generation'
  ) {
    return (
      <ImageGenerationApprovalCard
        toolCallId={part.toolCallId}
        details={pauseReason.details}
        disabled={!sessionId || !messageId}
        onApprove={() => sessionId && messageId && continuePausedToolCall(sessionId, messageId, part.toolCallId)}
        onDeny={() => sessionId && messageId && stopPausedToolCall(sessionId, messageId, part.toolCallId)}
        actionsRef={approvalActionsRef}
      />
    )
  }
  const title =
    pauseReason?.type === 'tool_call_limit'
      ? t('Paused after {{count}} steps. Check whether the task is on track, then continue or stop to adjust.', {
          count: pauseReason.maxToolCalls,
        })
      : pauseReason?.type === 'user_exec_approval'
        ? t('Approval required before executing this command.')
        : pauseReason?.type === 'file_mutation_approval'
          ? t('Approval required before modifying files.')
          : pauseReason?.type === 'app_action_approval'
            ? pauseReason.title
            : t('Tool execution is paused.')
  const payload =
    pauseReason?.type === 'user_exec_approval'
      ? pauseReason.command
      : pauseReason?.type === 'file_mutation_approval'
        ? `${pauseReason.title}\n\n${pauseReason.preview}`
        : pauseReason?.type === 'app_action_approval'
          ? pauseReason.preview
          : stringifyToolPayload(part.args)
  const handleDontAskAgain = (scope: 'session' | 'global') => {
    if (!sessionId || !messageId || pauseReason?.type !== 'tool_call_limit') return
    const count = pauseReason.maxToolCalls
    disableToolCallLimitPauseAndContinue(sessionId, messageId, part.toolCallId, scope)
      .then(() => {
        toastActions.add(
          scope === 'global'
            ? t("Chats won't pause every {{count}} steps anymore. You can turn it back on in Settings.", { count })
            : t(
                "This chat won't pause every {{count}} steps anymore. You can turn it back on in Conversation Settings.",
                { count }
              )
        )
      })
      .catch((error) => {
        log.error('Failed to turn off the step pause:', error)
        toastActions.add(t('Failed to update the setting. Please try again.'))
      })
  }
  return (
    <Stack data-testid={TestId.toolCall.approvalCard} data-tool-call-id={part.toolCallId} gap="xs">
      <Text size="xs" c="chatbox-secondary">
        {title}
      </Text>
      <Group gap="xs" ref={approvalActionsRef}>
        {pauseReason?.type === 'tool_call_limit' ? (
          <Button.Group>
            <Button
              data-testid={TestId.toolCall.continue}
              size="compact-xs"
              color="chatbox-brand"
              disabled={!sessionId || !messageId}
              onClick={() => sessionId && messageId && continuePausedToolCall(sessionId, messageId, part.toolCallId)}
            >
              {t('Continue')}
            </Button>
            <Menu position="bottom-start" shadow="md">
              <Menu.Target>
                <Button
                  data-testid={TestId.toolCall.dontAskAgain}
                  size="compact-xs"
                  color="chatbox-brand"
                  px={6}
                  disabled={!sessionId || !messageId}
                  aria-label={t('More continue options')}
                  style={{ borderInlineStart: '1px solid rgba(255, 255, 255, 0.4)' }}
                >
                  <IconChevronDown size={12} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown maw="min(20rem, calc(100vw - 1.5rem))">
                <Menu.Item
                  data-testid={TestId.toolCall.dontAskAgainSession}
                  style={{ whiteSpace: 'normal' }}
                  onClick={() => handleDontAskAgain('session')}
                >
                  {t("Continue, and don't pause this chat again")}
                </Menu.Item>
                <Menu.Item
                  data-testid={TestId.toolCall.dontAskAgainGlobal}
                  style={{ whiteSpace: 'normal' }}
                  onClick={() => handleDontAskAgain('global')}
                >
                  {t("Continue, and don't pause any chat again")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Button.Group>
        ) : (
          <Button
            data-testid={isApproval ? TestId.toolCall.approve : TestId.toolCall.continue}
            {...(isApproval ? APPROVAL_ACTION_BUTTON_PROPS : { size: 'compact-xs' as const })}
            leftSection={isApproval ? <IconCheck size={14} stroke={2.5} /> : undefined}
            color="chatbox-brand"
            disabled={!sessionId || !messageId}
            onClick={() => sessionId && messageId && continuePausedToolCall(sessionId, messageId, part.toolCallId)}
          >
            {isApproval ? t('Approve') : t('Continue')}
          </Button>
        )}
        <Button
          data-testid={TestId.toolCall.deny}
          {...(isApproval ? APPROVAL_ACTION_BUTTON_PROPS : { size: 'compact-xs' as const })}
          variant="light"
          color="chatbox-error"
          disabled={!sessionId || !messageId}
          onClick={() => sessionId && messageId && stopPausedToolCall(sessionId, messageId, part.toolCallId)}
        >
          {isApproval ? t('Deny') : t('Stop')}
        </Button>
      </Group>
      <Box style={{ maxHeight: APPROVAL_PAYLOAD_MAX_HEIGHT, overflow: 'auto' }}>
        <Code block>{payload}</Code>
      </Box>
      {pauseReason?.type === 'user_exec_approval' && pauseReason.explanation && (
        <Text size="xs" c="chatbox-secondary" style={{ whiteSpace: 'pre-wrap' }}>
          {pauseReason.explanation}
        </Text>
      )}
      {pauseReason?.type === 'user_exec_approval' && pauseReason.explanationError && (
        <Text size="xs" c="chatbox-tertiary">
          {t('Explanation failed')}
        </Text>
      )}
    </Stack>
  )
}

// Web search detail shown when a web_search timeline step is expanded: the
// queries plus the result cards (the same cards the old grouped card UI used).
const WebSearchDetails: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const { t } = useTranslation()
  if (part.state === 'error') {
    return <ToolCallErrorDetails part={part} />
  }
  const results = extractSearchResults(part)
  const queries = extractSearchQueries([part])
  return (
    <Stack gap={6}>
      {queries.length > 0 && (
        <Group gap={6}>
          {queries.map((query, index) => (
            <Text key={`${index}-${query}`} size="xs" c="chatbox-tertiary" fs="italic" lh={1.4}>
              "{query}"
            </Text>
          ))}
        </Group>
      )}
      {results.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
          {results.map((result, index) => (
            <SearchResultCard key={`${index}-${result.link}`} index={index} result={result} />
          ))}
        </div>
      ) : (
        <Text size="sm" c="chatbox-tertiary">
          {t('Search unsuccessful')}
        </Text>
      )}
    </Stack>
  )
}

const TimelineToolCallDetail: FC<{ part: MessageToolCallPart } & ToolCallActionContext> = ({
  part,
  sessionId,
  messageId,
}) => {
  if (part.state === 'paused') {
    return <PausedToolCallDetails part={part} sessionId={sessionId} messageId={messageId} />
  }
  if (part.toolName === 'web_search') {
    return <WebSearchDetails part={part} />
  }
  if (part.toolName === 'parse_link') {
    return <ParseLinkDetails part={part} />
  }
  if (isCommandExecutionPart(part)) {
    return <CommandExecutionDetails part={part} />
  }
  return <GeneralToolCallDetails part={part} />
}

// Shared timeline rail: the connecting line(s) plus the round status node.
// Used by both tool-call steps and reasoning steps so they line up on one thread.
const TimelineRail: FC<{
  isFirst: boolean
  isLast: boolean
  icon: React.ElementType
  dotBg: string
  stateColor: string
}> = ({ isFirst, isLast, icon, dotBg, stateColor }) => (
  <>
    {!isFirst && (
      <Box
        style={{
          position: 'absolute',
          left: TIMELINE_NODE_SIZE / 2 - 1,
          top: -TIMELINE_STACK_GAP,
          height: TIMELINE_STACK_GAP + TIMELINE_NODE_TOP,
          width: 2,
          borderRadius: 1,
          backgroundColor: 'color-mix(in srgb, var(--chatbox-border-primary) 70%, transparent)',
        }}
      />
    )}
    {!isLast && (
      <Box
        style={{
          position: 'absolute',
          left: TIMELINE_NODE_SIZE / 2 - 1,
          top: TIMELINE_NODE_TOP + TIMELINE_NODE_SIZE,
          bottom: -TIMELINE_STACK_GAP,
          width: 2,
          borderRadius: 1,
          backgroundColor: 'color-mix(in srgb, var(--chatbox-border-primary) 70%, transparent)',
        }}
      />
    )}
    <Box
      style={{
        position: 'absolute',
        left: 0,
        top: TIMELINE_NODE_TOP,
        width: TIMELINE_NODE_SIZE,
        height: TIMELINE_NODE_SIZE,
        borderRadius: 999,
        backgroundColor: dotBg,
        color: stateColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}
    >
      <InlineToolIcon icon={icon} size={14} />
    </Box>
  </>
)

type TimelineToolCallStepProps = {
  part: MessageToolCallPart
  isFirst: boolean
  isLast: boolean
  showPausedActionDetails?: boolean
} & ToolCallActionContext

const TimelineToolCallStepContent: FC<TimelineToolCallStepProps & { commandResult?: Record<string, unknown> }> = ({
  part,
  isFirst,
  isLast,
  sessionId,
  messageId,
  showPausedActionDetails = true,
  commandResult,
}) => {
  const { t } = useTranslation()
  const isPaused = part.state === 'paused'
  const isLoading = part.state === 'call'
  const commandExitCode = typeof commandResult?.exitCode === 'number' ? commandResult.exitCode : undefined
  // Stop marks every tool in the batch with `cancelled: true`, but the shape differs:
  // command tools settle as state 'result' (exit 130, possibly blob-offloaded), other
  // tools become state 'error' with a small inline result. Render both as "Stopped".
  const isCancelled = (commandResult ?? parseCommandExecutionResult(part.result))?.cancelled === true
  const isCommandFailure =
    isCommandExecutionPart(part) &&
    part.state === 'result' &&
    (commandResult?.success === false || (commandExitCode !== undefined && commandExitCode !== 0))
  const isBashNotAvailable = isBashNotAvailableResult(part)
  const isError = (part.state === 'error' && !isCancelled) || isBashNotAvailable || (isCommandFailure && !isCancelled)
  const isDone = part.state === 'result' && !isBashNotAvailable && !isCommandFailure
  const [expanded, setExpanded] = useAutoExpandOnSignal(isPaused || isBashNotAvailable)
  const isApprovalPaused = isPaused && isApprovalPauseReason(part.pauseReason)
  const approvalHighlighted = useApprovalCardHighlighted(part.toolCallId) && isApprovalPaused
  // The pill's "View" action must reveal the card even if the user collapsed the step.
  useEffect(() => {
    if (approvalHighlighted) setExpanded(true)
  }, [approvalHighlighted, setExpanded])
  const Icon = getToolIcon(part.toolName)

  // Per-step elapsed time: prefer the persisted duration, fall back to a live
  // timer while the call is still running. Hidden below the 2s threshold.
  const liveElapsed = useThinkingTimer(part.startTime, isLoading)
  const stepDuration = part.duration && part.duration > 0 ? part.duration : isLoading ? liveElapsed : 0
  const showTime = stepDuration >= MIN_STEP_DURATION_MS

  const stateColor =
    isPaused || isCancelled
      ? 'var(--chatbox-tint-warning)'
      : isLoading
        ? 'var(--chatbox-tint-brand)'
        : isError
          ? 'var(--chatbox-tint-error)'
          : 'var(--chatbox-tint-success)'
  const dotBg =
    isPaused || isCancelled
      ? 'color-mix(in srgb, var(--chatbox-tint-warning) 12%, transparent)'
      : isLoading
        ? 'var(--chatbox-background-brand-secondary)'
        : isError
          ? 'color-mix(in srgb, var(--chatbox-tint-error) 10%, transparent)'
          : 'color-mix(in srgb, var(--chatbox-tint-success) 10%, transparent)'

  const argSummary =
    part.toolName === 'user_exec'
      ? getFirstStringValue(part.args, ['command'])
      : part.toolName === 'code_execution'
        ? getFirstStringValue(part.args, ['code'])
        : part.toolName === 'create_download'
          ? getFirstStringValue(part.result, ['file_path']) || getFirstStringValue(part.args, ['file_path'])
          : part.toolName === 'parse_link'
            ? getFirstStringValue(part.args, ['url']) || getFirstStringValue(part.result, ['title', 'url'])
            : getFirstStringValue(part.args, ['path', 'file_path', 'query', 'pattern', 'command', 'skillName', 'name'])

  const resultSummary =
    !argSummary && part.state === 'result'
      ? getFirstStringValue(part.result, ['summary', 'title', 'content', 'stdout', 'stderr'])
      : undefined

  const summary = isCancelled
    ? t('Stopped')
    : isPaused
      ? t('Paused')
      : isLoading
        ? t('Running')
        : isBashNotAvailable
          ? t('Bash is not available on this Windows device.')
          : isError
            ? commandExitCode === undefined
              ? t('Failed')
              : `${t('Failed')} · exit ${commandExitCode}`
            : isCommandExecutionPart(part) && commandExitCode !== undefined
              ? `${truncateSummary(argSummary || t('Completed'))} · exit ${commandExitCode}`
              : truncateSummary(argSummary || resultSummary || t('Completed'))

  const hasDetail = isPaused ? showPausedActionDetails : part.state !== 'call' || isCommandExecutionPart(part)

  return (
    <Box pos="relative" pl={32} style={{ minHeight: 28, overflow: 'visible' }}>
      <TimelineRail isFirst={isFirst} isLast={isLast} icon={Icon} dotBg={dotBg} stateColor={stateColor} />
      <UnstyledButton
        onClick={hasDetail ? () => setExpanded((prev) => !prev) : undefined}
        style={{
          cursor: hasDetail ? 'pointer' : 'default',
          maxWidth: '100%',
          display: 'block',
        }}
      >
        <Group
          gap={8}
          wrap="nowrap"
          align="center"
          style={{ height: TIMELINE_NODE_CENTER * 2, maxWidth: '100%', transform: 'translateY(-1px)' }}
        >
          <Text size="sm" fw={500} c={isError ? 'chatbox-error' : 'chatbox-primary'} lh="20px" className="shrink-0">
            {getToolName(part.toolName, part.args)}
          </Text>
          {summary && (
            <Text size="xs" c="chatbox-tertiary" lh="20px" truncate="end" style={{ minWidth: 0 }}>
              · {summary}
            </Text>
          )}
          {isLoading ? (
            <ToolCallRunningDots />
          ) : isError ? (
            <InlineToolIcon icon={IconCircleXFilled} size={13} color="var(--chatbox-tint-error)" />
          ) : isDone ? (
            <InlineToolIcon icon={IconCheck} size={13} color="var(--chatbox-tint-success)" />
          ) : null}
          {showTime && (
            <Text size="xs" c="chatbox-tertiary" lh="20px" className="shrink-0 tabular-nums">
              {formatElapsedTime(stepDuration)}
            </Text>
          )}
          {hasDetail && (
            <InlineToolIcon
              icon={IconChevronDown}
              size={13}
              color="var(--chatbox-tertiary)"
              className={clsx('transition-transform', expanded ? 'rotate-180' : '')}
            />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={expanded && hasDetail}>
        <Box
          // The rotating locate ring plays only after the pill's "View" action, as
          // the "here it is" feedback — not as a permanent attention grabber.
          className={approvalHighlighted ? 'chatbox-approval-ring' : undefined}
          mt={6}
          mb={2}
          p={10}
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: 'color-mix(in srgb, var(--chatbox-background-gray-secondary) 72%, transparent)',
            color: 'var(--chatbox-tint-secondary)',
            // Amber accent marks "decision needed" apart from routine tool details.
            borderLeft: isApprovalPaused ? '3px solid var(--chatbox-tint-warning)' : undefined,
          }}
        >
          <TimelineToolCallDetail part={part} sessionId={sessionId} messageId={messageId} />
        </Box>
      </Collapse>
    </Box>
  )
}

const CommandTimelineToolCallStep: FC<TimelineToolCallStepProps> = (props) => {
  const commandResult = useCommandExecutionResult(props.part)
  return <TimelineToolCallStepContent {...props} commandResult={commandResult} />
}

const TimelineToolCallStep: FC<TimelineToolCallStepProps> = (props) =>
  isCommandExecutionPart(props.part) ? (
    <CommandTimelineToolCallStep {...props} />
  ) : (
    <TimelineToolCallStepContent {...props} />
  )

// A timeline step is a tool call, a reasoning ("thinking") block, or an
// intermediate text block the assistant emitted between steps.
export type StepTimelinePart = MessageToolCallPart | MessageReasoningPart | MessageTextPart

type CopyReasoningHandler = (content: string) => (e: React.MouseEvent<HTMLButtonElement>) => void

// Renders an intermediate assistant text block as a timeline node. Markdown
// rendering is delegated to the caller (Message owns the settings/uniqueId).
type RenderStepText = (part: MessageTextPart, index: number) => ReactNode

// tool_call_limit pauses freeze a whole parallel batch, but the Continue/Stop affordance
// should render once per batch — on the batch's first paused part (parts without a
// stepIndex each count as their own batch).
function makeShouldShowPausedActions(parts: StepTimelinePart[]): (part: MessageToolCallPart) => boolean {
  const actionIds = new Set<string>()
  const seenStepIndexes = new Set<number>()

  for (const part of parts) {
    if (part.type !== 'tool-call') continue
    if (part.state !== 'paused' || part.pauseReason?.type !== 'tool_call_limit') continue
    if (part.stepIndex !== undefined) {
      if (seenStepIndexes.has(part.stepIndex)) continue
      seenStepIndexes.add(part.stepIndex)
    }
    actionIds.add(part.toolCallId)
  }

  return (part) =>
    part.state !== 'paused' || part.pauseReason?.type !== 'tool_call_limit' || actionIds.has(part.toolCallId)
}

const TimelineTextStep: FC<{ children: ReactNode; isFirst: boolean; isLast: boolean }> = ({
  children,
  isFirst,
  isLast,
}) => (
  <Box pos="relative" pl={32} style={{ minHeight: TIMELINE_NODE_CENTER * 2, overflow: 'visible' }}>
    <TimelineRail
      isFirst={isFirst}
      isLast={isLast}
      icon={IconMessage}
      dotBg="var(--chatbox-background-gray-secondary)"
      stateColor="var(--chatbox-tint-tertiary)"
    />
    <Box
      className="text-sm break-words [overflow-wrap:anywhere] [&_p]:!my-0 [&>*:first-child]:!mt-0 [&>*:last-child]:!mb-0"
      style={{
        minHeight: TIMELINE_NODE_CENTER * 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transform: 'translateY(-1px)',
      }}
    >
      {children}
    </Box>
  </Box>
)

// Shared reasoning display state, kept in sync with how a reasoning block is
// rendered both standalone (ReasoningContentUI) and inside the step timeline.
function useReasoningState(message: Message | undefined, part: MessageReasoningPart | undefined) {
  const reasoningContent = part?.text ?? message?.reasoningContent ?? ''
  const hasActiveStatus = (message?.status?.length ?? 0) > 0
  const rawIsThinking =
    (message?.generating &&
      !!part &&
      !hasActiveStatus &&
      !!message?.contentParts &&
      message.contentParts.length > 0 &&
      message.contentParts[message.contentParts.length - 1] === part) ||
    false

  // Once thinking transitions to done, lock it as done to prevent flicker
  // when new content parts are appended during streaming.
  const wasEverDoneRef = useRef(false)
  if (!rawIsThinking && (reasoningContent.length > 0 || (part?.duration && part.duration > 0))) {
    wasEverDoneRef.current = true
  }
  const isThinking = rawIsThinking && !wasEverDoneRef.current

  const elapsedTime = useThinkingTimer(part?.startTime, isThinking)
  const displayTime =
    part?.duration && part.duration > 0 ? part.duration : isThinking && elapsedTime > 0 ? elapsedTime : 0

  return { reasoningContent, isThinking, displayTime }
}

const TimelineReasoningStep: FC<{
  part: MessageReasoningPart
  message?: Message
  isFirst: boolean
  isLast: boolean
  onCopyReasoningContent?: CopyReasoningHandler
}> = ({ part, message, isFirst, isLast, onCopyReasoningContent }) => {
  const { t } = useTranslation()
  const { reasoningContent, isThinking, displayTime } = useReasoningState(message, part)
  const [expanded, setExpanded] = useState(false)
  const shouldShowTimer = message?.isStreamingMode === true
  const showTime = shouldShowTimer && displayTime >= MIN_STEP_DURATION_MS
  const hasDetail = reasoningContent.length > 0

  const stateColor = isThinking ? 'var(--chatbox-tint-brand)' : 'var(--chatbox-tint-warning)'
  const dotBg = isThinking
    ? 'var(--chatbox-background-brand-secondary)'
    : 'color-mix(in srgb, var(--chatbox-tint-warning) 12%, transparent)'

  const label = isThinking
    ? t('Thinking')
    : showTime
      ? t('Thought for {{time}}', { time: formatElapsedTime(displayTime) })
      : t('Deeply thought')

  return (
    <Box pos="relative" pl={32} style={{ minHeight: 28, overflow: 'visible' }}>
      <TimelineRail isFirst={isFirst} isLast={isLast} icon={IconBulb} dotBg={dotBg} stateColor={stateColor} />
      <UnstyledButton
        onClick={hasDetail ? () => setExpanded((prev) => !prev) : undefined}
        style={{ cursor: hasDetail ? 'pointer' : 'default', maxWidth: '100%', display: 'block' }}
      >
        <Group
          gap={8}
          wrap="nowrap"
          align="center"
          style={{ height: TIMELINE_NODE_CENTER * 2, maxWidth: '100%', transform: 'translateY(-1px)' }}
        >
          <Text
            size="sm"
            fw={500}
            c="chatbox-secondary"
            lh="20px"
            fs={isThinking ? 'italic' : undefined}
            className="shrink-0"
          >
            {label}
          </Text>
          {isThinking && <ToolCallRunningDots />}
          {expanded && hasDetail && onCopyReasoningContent && (
            <ActionIcon
              variant="subtle"
              size="xs"
              c="chatbox-gray"
              onClick={(e) => {
                e.stopPropagation()
                onCopyReasoningContent(reasoningContent)(e)
              }}
              aria-label={t('Copy reasoning content')}
            >
              <ScalableIcon icon={IconCopy} size={12} />
            </ActionIcon>
          )}
          {hasDetail && (
            <InlineToolIcon
              icon={IconChevronDown}
              size={13}
              color="var(--chatbox-tertiary)"
              className={clsx('transition-transform', expanded ? 'rotate-180' : '')}
            />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={expanded && hasDetail}>
        <Box
          mt={6}
          mb={2}
          pl="sm"
          style={{
            borderLeft: '2px solid var(--chatbox-tint-warning)',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          <Text size="sm" c="chatbox-tertiary" style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {reasoningContent}
          </Text>
        </Box>
      </Collapse>
    </Box>
  )
}

// Unified timeline that threads consecutive reasoning + tool-call steps together
// with a single connecting line so an agent run reads as one coherent sequence.
export const StepTimelineUI: FC<
  {
    parts: StepTimelinePart[]
    message?: Message
    onCopyReasoningContent?: CopyReasoningHandler
    renderText?: RenderStepText
  } & ToolCallActionContext
> = ({ parts, message, sessionId, messageId, onCopyReasoningContent, renderText }) => {
  const shouldShowPausedActions = makeShouldShowPausedActions(parts)

  return (
    <Box pos="relative" my={8} mb={12}>
      <Stack gap={TIMELINE_STACK_GAP}>
        {parts.map((part, index) => {
          const isFirst = index === 0
          const isLast = index === parts.length - 1
          if (part.type === 'reasoning') {
            return (
              <TimelineReasoningStep
                key={`reasoning-${index}`}
                part={part}
                message={message}
                isFirst={isFirst}
                isLast={isLast}
                onCopyReasoningContent={onCopyReasoningContent}
              />
            )
          }
          if (part.type === 'text') {
            return (
              <TimelineTextStep key={`text-${index}`} isFirst={isFirst} isLast={isLast}>
                {renderText ? (
                  renderText(part, index)
                ) : (
                  <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                    {part.text}
                  </Text>
                )}
              </TimelineTextStep>
            )
          }
          return (
            <TimelineToolCallStep
              key={part.toolCallId}
              part={part}
              isFirst={isFirst}
              isLast={isLast}
              sessionId={sessionId}
              messageId={messageId}
              showPausedActionDetails={shouldShowPausedActions(part)}
            />
          )
        })}
      </Stack>
    </Box>
  )
}

// Backwards-compatible wrapper for tool-call-only timelines (e.g. a single
// paused tool call rendered outside a step group).
export const ToolCallGroupUI: FC<{ parts: MessageToolCallPart[] } & ToolCallActionContext> = ({
  parts,
  sessionId,
  messageId,
}) => <StepTimelineUI parts={parts} sessionId={sessionId} messageId={messageId} />

// ─── Reasoning / Thinking (Minimal Inline) ──────────────────────────

export const ReasoningContentUI: FC<{
  message: Message
  part?: MessageReasoningPart
  onCopyReasoningContent: (content: string) => (e: React.MouseEvent<HTMLButtonElement>) => void
}> = ({ message, part, onCopyReasoningContent }) => {
  const { t } = useTranslation()
  const { reasoningContent, isThinking, displayTime } = useReasoningState(message, part)

  const [isExpanded, setIsExpanded] = useState<boolean>(false)

  const shouldShowTimer = message.isStreamingMode === true
  const showTime = shouldShowTimer && displayTime >= MIN_STEP_DURATION_MS

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const showCopy = isExpanded && reasoningContent.length > 0
  const copyButton = showCopy ? (
    <ActionIcon
      variant="subtle"
      size="xs"
      c="chatbox-gray"
      onClick={(e) => {
        e.stopPropagation()
        onCopyReasoningContent(reasoningContent)(e)
      }}
      aria-label={t('Copy reasoning content')}
    >
      <ScalableIcon icon={IconCopy} size={12} />
    </ActionIcon>
  ) : null

  const reasoningCollapse = reasoningContent.length > 0 && (
    <Collapse in={isExpanded}>
      <Box
        mt={4}
        pl="sm"
        style={{
          borderLeft: '1px solid var(--chatbox-tint-placeholder)',
          maxHeight: 400,
          overflowY: 'auto',
          marginLeft: 7,
        }}
      >
        <Text size="sm" c="chatbox-tertiary" style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
          {reasoningContent}
        </Text>
      </Box>
    </Collapse>
  )

  if (isThinking) {
    return (
      <Box mb={4}>
        <UnstyledButton onClick={toggleExpanded}>
          <Group gap={6}>
            <Box
              w={6}
              h={6}
              style={{
                borderRadius: '50%',
                backgroundColor: 'var(--chatbox-tint-brand)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <Text size="sm" c="chatbox-tertiary" fs="italic">
              {t('Thinking')}
              {showTime ? ` · ${formatElapsedTime(displayTime)}` : '...'}
            </Text>
            {copyButton}
          </Group>
        </UnstyledButton>
        {reasoningCollapse}
      </Box>
    )
  }

  return (
    <Box mb="xs">
      <Box role="button" onClick={toggleExpanded}>
        <Group gap={6}>
          <ScalableIcon icon={IconBulb} size={14} color="var(--chatbox-tint-warning)" />
          <Text size="sm" fw={600} c="chatbox-secondary" td="underline">
            {showTime ? t('Thought for {{time}}', { time: formatElapsedTime(displayTime) }) : t('Deeply thought')}
          </Text>
          {copyButton}
        </Group>
      </Box>
      <Collapse in={isExpanded}>
        <Box
          ml={4}
          mt={4}
          pl="sm"
          style={{ borderLeft: '2px solid var(--chatbox-tint-warning)', maxHeight: 400, overflowY: 'auto' }}
        >
          <Text size="sm" c="chatbox-tertiary" style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {reasoningContent}
          </Text>
        </Box>
      </Collapse>
    </Box>
  )
}
