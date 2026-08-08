import { sanitizeUrl } from '@braintree/sanitize-url'
import { useTheme } from '@mui/material'
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ElementType,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import * as latex from '../packages/latex'
import { isRenderableCodeLanguage } from './Artifact'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Loader, Stack, Text, useComputedColorScheme } from '@mantine/core'
import {
  IconBrandCpp,
  IconBrandCSharp,
  IconBrandCss3,
  IconBrandDocker,
  IconBrandGolang,
  IconBrandJavascript,
  IconBrandKotlin,
  IconBrandPhp,
  IconBrandPowershell,
  IconBrandPython,
  IconBrandReact,
  IconBrandRust,
  IconBrandSass,
  IconBrandSwift,
  IconBrandTypescript,
  IconBrandVue,
  IconCheck,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconFileTypeCsv,
  IconFileTypeHtml,
  IconFileTypeSql,
  IconFileTypeSvg,
  IconFileTypeTxt,
  IconFileTypeXml,
  IconJson,
  IconPlayerPlayFilled,
  type IconProps,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { visit } from 'unist-util-visit'
import { AppTooltip as Tooltip } from '@/components/ui/tooltip'
import { useCopied } from '@/hooks/useCopied'
import { highlight, highlightSync, type ShikiTheme } from '../packages/shiki'
import { ScalableIcon } from './common/ScalableIcon'
import { ImageViewer, ImageViewerItem } from './ImageViewer'
import IconDart from './icons/Dart'
import IconJava from './icons/Java'
import { MessageMermaid, SVGPreview } from './Mermaid'
import { SandboxFileLink } from './message-parts/SandboxFileLink'
import { parseSandboxLinkHref } from './message-parts/sandbox-link'
import { type StreamingTextSegment, useStreamingTextSegments, wrapStreamingSegmentsInHast } from './streaming-text-fade'
import './shiki-code.css'

const CODE_BLOCK_COLLAPSE_LINE_THRESHOLD = 7
type RehypePlugins = NonNullable<ComponentProps<typeof ReactMarkdown>['rehypePlugins']>

function remarkAddCodeIndex() {
  // biome-ignore lint/suspicious/noExplicitAny: remark AST nodes lack a friendly type here
  return (tree: any) => {
    let counter = 0
    visit(tree, 'code', (node) => {
      node.data = node.data || {}
      node.data.hProperties = node.data.hProperties || {}
      node.data.hProperties['data-code-index'] = counter++
    })
  }
}

function rehypeWrapStreamingSegments(options: StreamingTextSegment[]) {
  return (tree: import('hast').Root) => {
    wrapStreamingSegmentsInHast(tree, options)
  }
}

function Markdown(props: {
  children: string
  uniqueId?: string
  sessionId?: string
  enableLaTeXRendering?: boolean
  enableMermaidRendering?: boolean
  hiddenCodeActions?: boolean
  hiddenCodeCopyButton?: boolean
  className?: string
  generating?: boolean
  forceColorScheme?: 'light' | 'dark'
  onCodeCopy?: () => void
  onPreviewWebpage?: () => void
}) {
  const {
    children,
    uniqueId,
    sessionId,
    enableLaTeXRendering = true,
    enableMermaidRendering = true,
    hiddenCodeActions,
    hiddenCodeCopyButton,
    className,
    generating,
    forceColorScheme,
    onCodeCopy,
    onPreviewWebpage,
  } = props

  const codeFences = useMemo(() => (children.match(/```/g) || []).length, [children])
  const generatingCodeIndex = useMemo(() => (codeFences % 2 === 0 ? -1 : Math.floor(codeFences / 2)), [codeFences])
  const processedChildren = useMemo(
    () => (enableLaTeXRendering ? latex.processLaTeX(children) : children),
    [children, enableLaTeXRendering]
  )
  const streamingSegments = useStreamingTextSegments(processedChildren, generating, uniqueId)
  const rehypePlugins = useMemo<RehypePlugins>(
    () =>
      streamingSegments.length > 0 ? [rehypeKatex, [rehypeWrapStreamingSegments, streamingSegments]] : [rehypeKatex],
    [streamingSegments]
  )

  return (
    <ImageViewer>
      <ReactMarkdown
        className={`break-words [overflow-wrap:anywhere] ${className || ''}`}
        remarkPlugins={
          enableLaTeXRendering
            ? [remarkGfm, remarkMath, remarkBreaks, remarkAddCodeIndex]
            : [remarkGfm, remarkBreaks, remarkAddCodeIndex]
        }
        rehypePlugins={rehypePlugins}
        // react-markdown's default defaultUrlTransform will incorrectly encode query parameters in URLs (e.g. & becomes &amp;)
        // Use sanitizeUrl here to avoid that and to prevent XSS attacks
        urlTransform={(url) => sanitizeUrl(url)}
        components={useMemo(
          () => ({
            // biome-ignore lint/suspicious/noExplicitAny: react-markdown code component props are loosely typed
            code: (props: any) => {
              const codeIndex = typeof props['data-code-index'] === 'number' ? props['data-code-index'] : -1
              return (
                <CodeRenderer
                  {...props}
                  uniqueId={uniqueId ? `${uniqueId}-code-${codeIndex}` : undefined}
                  sessionId={sessionId}
                  hiddenCodeActions={hiddenCodeActions}
                  hiddenCodeCopyButton={hiddenCodeCopyButton}
                  enableMermaidRendering={enableMermaidRendering}
                  generating={generating && generatingCodeIndex === codeIndex}
                  forceColorScheme={forceColorScheme}
                  onCodeCopy={onCodeCopy}
                  onPreviewWebpage={onPreviewWebpage}
                />
              )
            },
            a: ({ node, href, children: linkChildren, ...props }) => {
              // Models sometimes hand-write sandbox "download links" (sandbox:/mnt/data/...)
              // instead of calling create_download. Those hrefs are dead — render a file
              // chip that rescues the file from the session sandbox instead.
              const sandboxTarget = parseSandboxLinkHref(href)
              if (sandboxTarget) {
                return (
                  <SandboxFileLink target={sandboxTarget} sessionId={sessionId}>
                    {linkChildren}
                  </SandboxFileLink>
                )
              }
              return (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                >
                  {linkChildren}
                </a>
              )
            },
            img: ({ node, ...props }) => <MarkdownImage {...props} />,
          }),
          [
            uniqueId,
            sessionId,
            hiddenCodeActions,
            hiddenCodeCopyButton,
            enableMermaidRendering,
            generating,
            generatingCodeIndex,
            forceColorScheme,
            onCodeCopy,
            onPreviewWebpage,
          ]
        )}
      >
        {processedChildren}
      </ReactMarkdown>
    </ImageViewer>
  )
}

export default memo(Markdown)

function parseImageDimension(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') return value > 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function MarkdownImage({ src, alt, width, height, className, onLoad, onClick, ...props }: ComponentProps<'img'>) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>()

  if (!src) return <img {...props} alt={alt} width={width} height={height} className={className} />

  const viewerWidth = naturalSize?.width ?? parseImageDimension(width) ?? 1024
  const viewerHeight = naturalSize?.height ?? parseImageDimension(height) ?? 1024

  return (
    <ImageViewerItem
      original={src}
      thumbnail={src}
      width={viewerWidth}
      height={viewerHeight}
      alt={alt}
      caption={props.title}
    >
      {({ ref, open }) => (
        <img
          {...props}
          ref={ref}
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={clsx(className, 'cursor-zoom-in')}
          onLoad={(event) => {
            onLoad?.(event)
            const image = event.currentTarget
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
            }
          }}
          onClick={(event) => {
            onClick?.(event)
            if (event.defaultPrevented) return
            event.preventDefault()
            event.stopPropagation()
            open(event)
          }}
        />
      )}
    </ImageViewerItem>
  )
}

export const CodeRenderer = memo(
  (props: {
    children: string
    className?: string
    uniqueId?: string
    sessionId?: string
    hiddenCodeActions?: boolean
    hiddenCodeCopyButton?: boolean
    generating?: boolean
    enableMermaidRendering?: boolean
    forceColorScheme?: 'light' | 'dark'
    onCodeCopy?: () => void
    onPreviewWebpage?: () => void
  }) => {
    const theme = useTheme()
    const {
      children,
      className,
      hiddenCodeActions,
      hiddenCodeCopyButton,
      generating,
      enableMermaidRendering,
      forceColorScheme,
      onCodeCopy,
      onPreviewWebpage,
    } = props
    const language = /language-(\w+)/.exec(className || '')?.[1] || 'text'
    if (!String(children).includes('\n')) {
      return <InlineCode className={className}>{children}</InlineCode>
    }
    if (language === 'mermaid' && enableMermaidRendering) {
      return <MessageMermaid source={String(children)} theme={theme.palette.mode} generating={generating} />
    }

    return (
      <>
        <BlockCode
          uniqueId={props.uniqueId}
          sessionId={props.sessionId}
          hiddenCodeActions={hiddenCodeActions}
          hiddenCodeCopyButton={hiddenCodeCopyButton}
          language={language}
          generating={generating}
          forceColorScheme={forceColorScheme}
          onCodeCopy={onCodeCopy}
          onPreviewWebpage={onPreviewWebpage}
        >
          {children}
        </BlockCode>
        {language === 'svg' ||
        (language === 'text' && String(children).startsWith('<svg')) ||
        (language === 'xml' && String(children).startsWith('<svg')) ||
        (language === 'html' && String(children).startsWith('<svg')) ? (
          <SVGPreview xmlCode={String(children)} className="max-w-sm" generating={generating} />
        ) : null}
      </>
    )
  }
)

const InlineCode = memo((props: { children: string; className?: string }) => {
  const { children, className } = props
  return (
    <code
      className={clsx(
        'inline-code bg-chatbox-background-secondary text-[0.85em] rounded-sm px-1 py-0.5 mx-0.5',
        className
      )}
    >
      {children}
    </code>
  )
})

// Define the Context type
interface BlockCodeCollapsedStateContextType {
  collapsedStates: Record<string, boolean>
  toggleCollapse: (id: string) => void
  setCollapse: (id: string, collapsed: boolean) => void
  isCollapsed: (id: string) => boolean
  resetAll: () => void
}

// Create the Context
const BlockCodeCollapsedStateContext = createContext<BlockCodeCollapsedStateContextType | undefined>(undefined)

// Provider Props type
interface BlockCodeCollapsedStateProviderProps {
  children: ReactNode
  defaultCollapsed?: boolean // default collapsed state
}

// Provider component
export const BlockCodeCollapsedStateProvider: React.FC<BlockCodeCollapsedStateProviderProps> = ({
  children,
  defaultCollapsed = false,
}) => {
  const [collapsedStates, setCollapsedStates] = useState<Record<string, boolean>>({})

  // Toggle collapse state
  const toggleCollapse = useCallback(
    (id: string) => {
      setCollapsedStates((prev) => ({
        ...prev,
        [id]: typeof prev[id] === 'boolean' ? !prev[id] : !defaultCollapsed,
      }))
    },
    [defaultCollapsed]
  )

  // Set specific collapse state
  const setCollapse = useCallback((id: string, collapsed: boolean) => {
    setCollapsedStates((prev) => ({
      ...prev,
      [id]: collapsed,
    }))
  }, [])

  // Check if collapsed
  const isCollapsed = useCallback(
    (id: string) => collapsedStates[id] ?? defaultCollapsed,
    [collapsedStates, defaultCollapsed]
  )

  // Reset all states
  const resetAll = useCallback(() => {
    setCollapsedStates({})
  }, [])

  const value: BlockCodeCollapsedStateContextType = useMemo(
    () => ({
      collapsedStates,
      toggleCollapse,
      setCollapse,
      isCollapsed,
      resetAll,
    }),
    [collapsedStates, toggleCollapse, setCollapse, isCollapsed, resetAll]
  )

  return <BlockCodeCollapsedStateContext.Provider value={value}>{children}</BlockCodeCollapsedStateContext.Provider>
}

// Custom hook
export const useBlockCodeCollapsedState = (messageId: string) => {
  const context = useContext(BlockCodeCollapsedStateContext)

  if (context === undefined) {
    throw new Error('useBlockCodeCollapsedState must be used within a BlockCodeCollapsedStateProvider')
  }

  if (!messageId) {
    console.warn('useBlockCodeCollapsedState: messageId is empty, collapse state may not work correctly')
  }

  return {
    collapsed: context.isCollapsed(messageId),
    toggleCollapsed: () => context.toggleCollapse(messageId),
    setCollapsed: (collapsed: boolean) => context.setCollapse(messageId, collapsed),
  }
}

type BlockCodeProps = {
  language: string
  children: string
  uniqueId?: string
  sessionId?: string
  hiddenCodeActions?: boolean
  hiddenCodeCopyButton?: boolean
  generating?: boolean
  forceColorScheme?: 'light' | 'dark'
  onCodeCopy?: () => void
  onPreviewWebpage?: () => void
}

const CodeIcons: { [key: string]: ElementType<IconProps> } = {
  HTML: IconFileTypeHtml,
  XML: IconFileTypeXml,
  JSON: IconJson,
  CSS: IconBrandCss3,
  SASS: IconBrandSass,
  SCSS: IconBrandSass,
  CSV: IconFileTypeCsv,
  SVG: IconFileTypeSvg,
  TEXT: IconFileTypeTxt,
  JAVASCRIPT: IconBrandJavascript,
  JS: IconBrandJavascript,
  TYPESCRIPT: IconBrandTypescript,
  TS: IconBrandTypescript,
  JSX: IconBrandReact,
  TSX: IconBrandReact,
  VUE: IconBrandVue,
  JAVA: IconJava,
  SWIFT: IconBrandSwift,
  KOTLIN: IconBrandKotlin,
  PYTHON: IconBrandPython,
  PY: IconBrandPython,
  PHP: IconBrandPhp,
  GO: IconBrandGolang,
  GOLANG: IconBrandGolang,
  CPP: IconBrandCpp,
  CSHARP: IconBrandCSharp,
  RUST: IconBrandRust,
  BASH: IconBrandPowershell,
  SHELL: IconBrandPowershell,
  POWERSHELL: IconBrandPowershell,
  SQL: IconFileTypeSql,
  MYSQL: IconFileTypeSql,
  DOCKER: IconBrandDocker,
  DOCKERFILE: IconBrandDocker,
  DART: IconDart,
}

function useShikiHtml(code: string, language: string, theme: ShikiTheme): string | null {
  const syncHtml = useMemo(() => highlightSync(code, language, theme), [code, language, theme])
  const [asyncHtml, setAsyncHtml] = useState<string | null>(null)

  useEffect(() => {
    if (syncHtml !== null) return
    let cancelled = false
    void highlight(code, language, theme).then((result) => {
      if (!cancelled) setAsyncHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [syncHtml, code, language, theme])

  return syncHtml ?? asyncHtml
}

const ShikiCodeBlock = memo(({ code, language, theme }: { code: string; language: string; theme: ShikiTheme }) => {
  const html = useShikiHtml(code, language, theme)
  const lineNumberStyle = useMemo(() => {
    const lines = code.split('\n').length
    const lineNumberWidth = `${Math.max(1, lines).toString().length - 0.5}em`
    return {
      '--shiki-line-number-width': lineNumberWidth,
    } as CSSProperties
  }, [code])

  if (!html) {
    return (
      <div className="shiki-code-wrapper shiki-code-fallback max-w-full min-w-0 text-xs" style={lineNumberStyle}>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="shiki-code-wrapper max-w-full min-w-0 text-xs"
      style={lineNumberStyle}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML from code tokenization
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

const BlockCode = memo(
  ({
    children,
    uniqueId,
    sessionId,
    hiddenCodeActions,
    hiddenCodeCopyButton,
    language,
    generating,
    forceColorScheme,
    onCodeCopy,
    onPreviewWebpage,
  }: BlockCodeProps) => {
    const { t } = useTranslation()
    const computedColorScheme = useComputedColorScheme()
    const colorScheme = forceColorScheme || computedColorScheme
    const shikiTheme: ShikiTheme = colorScheme !== 'light' ? 'one-dark-pro' : 'one-light'
    const languageName = useMemo(() => language.toUpperCase(), [language])
    const isRenderableCode = useMemo(() => isRenderableCodeLanguage(language), [language])

    const icon = useMemo(() => CodeIcons[languageName] || IconCode, [languageName])

    const { copied, copy } = useCopied(String(children))
    const onClickCopy = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation()
        event.preventDefault()
        copy()
        onCodeCopy?.()
      },
      [copy, onCodeCopy]
    )
    const onClickArtifact = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation()
        event.preventDefault()
        NiceModal.show('artifact-preview', {
          htmlCode: String(children),
          uniqueId,
          sessionId,
        }).catch(() => null)
      },
      [children, uniqueId, sessionId]
    )

    const needCollapse = useMemo(
      () => !!uniqueId && children.split('\n').length > CODE_BLOCK_COLLAPSE_LINE_THRESHOLD,
      [uniqueId, children]
    )
    const { collapsed, toggleCollapsed } = useBlockCodeCollapsedState(uniqueId || '')
    const onClickCollapse = (event: React.MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      toggleCollapsed()
    }

    return (
      <Stack
        gap={0}
        className="code-block-container w-full max-w-full min-w-0 bg-chatbox-background-primary rounded-md overflow-hidden"
      >
        <Flex
          justify="space-between"
          className={clsx(
            'code-block-header px-xs pl-sm pt-xs pb-0 bg-chatbox-background-primary select-none',
            !needCollapse || !collapsed ? 'sticky top-0 z-10' : ''
          )}
        >
          <Flex align="center" gap="xs">
            {generating ? (
              <Loader size={10} />
            ) : (
              <ScalableIcon size={14} icon={icon} color="var(--chatbox-tint-tertiary)" />
            )}
            <Text span c="chatbox-tertiary" fw="500" className="font-mono text-xs">
              {languageName}
            </Text>
          </Flex>

          {!hiddenCodeActions && (
            <Flex gap="xs" align="center">
              {!hiddenCodeCopyButton && (
                <Tooltip label={t('copy')} withArrow openDelay={1000}>
                  <ActionIcon
                    variant="transparent"
                    color={copied ? 'chatbox-success' : 'chatbox-tertiary'}
                    size={18}
                    onClick={onClickCopy}
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}

              {isRenderableCode && (
                <Tooltip label={t('Preview')} withArrow openDelay={1000}>
                  <ActionIcon variant="transparent" color="chatbox-tertiary" size={18} onClick={onClickArtifact}>
                    <IconPlayerPlayFilled size={14} />
                  </ActionIcon>
                </Tooltip>
              )}

              {needCollapse && (
                <Tooltip label={collapsed ? t('Expand') : t('Collapse')} withArrow openDelay={1000}>
                  <ActionIcon
                    variant="transparent"
                    color="chatbox-tertiary"
                    size={18}
                    onClick={onClickCollapse}
                    className={clsx('transition-transform ease-linear', !collapsed ? 'rotate-90' : '')}
                  >
                    <IconChevronRight size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Flex>
          )}
        </Flex>

        <Stack
          className={clsx(
            'max-w-full min-w-0',
            needCollapse && collapsed && generating ? 'h-[10rem] overflow-hidden justify-end' : '',
            needCollapse && collapsed && !generating ? 'h-[10rem] overflow-auto' : ''
          )}
        >
          <ShikiCodeBlock code={children} language={language} theme={shikiTheme} />
        </Stack>
      </Stack>
    )
  }
)
