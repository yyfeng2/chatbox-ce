import { MantineProvider } from '@mantine/core'
import { escape as escapeHtml } from 'lodash'
import ReactDOMServer from 'react-dom/server'
import Markdown, { BlockCodeCollapsedStateProvider } from '@/components/Markdown'
import * as base64 from '@/packages/base64'
import storage from '@/storage'
import type { SessionThread } from '../../shared/types'
import {
  collectToolCallSummaries,
  getAttachmentNames,
  stringifyDataForExport,
  type ToolCallSummary,
} from '../../shared/utils/chat-export'

// Plain-text Markdown / TXT exporters are shared with the native mobile shell.
export { formatChatAsMarkdown, formatChatAsTxt } from '../../shared/utils/chat-export'

function renderToolCallHtml(summary: ToolCallSummary): string {
  let html = '<div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">\n'
  html += `<p class="font-semibold text-sm">${escapeHtml(summary.toolName)} <span class="text-xs text-slate-500">(state: ${escapeHtml(summary.state)})</span></p>\n`
  const argsText = stringifyDataForExport(summary.args)
  if (argsText) {
    html += '<p class="text-xs text-slate-500 mt-1 mb-1">Args</p>\n'
    html += `<pre class="bg-white border border-slate-200 rounded p-2 text-xs whitespace-pre-wrap overflow-x-auto">${escapeHtml(argsText)}</pre>\n`
  }
  const resultText = stringifyDataForExport(summary.result)
  if (resultText) {
    html += '<p class="text-xs text-slate-500 mt-2 mb-1">Result</p>\n'
    html += `<pre class="bg-white border border-slate-200 rounded p-2 text-xs whitespace-pre-wrap overflow-x-auto">${escapeHtml(resultText)}</pre>\n`
  }
  html += '</div>\n'
  return html
}

export async function formatChatAsHtml(sessionName: string, threads: SessionThread[]) {
  let content = '<div class="prose-sm">\n'
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i]
    content += `<h2>${i + 1}. ${thread.name}</h2>\n`
    for (const msg of thread.messages) {
      const attachments = getAttachmentNames(msg)
      const toolCallSummaries = collectToolCallSummaries(msg)
      const renderedToolCalls = new Set<string>()
      content += '<div class="mb-4">\n'
      if (msg.role !== 'assistant') {
        content += `<p class="text-green-500 text-lg"><b>${msg.role.toUpperCase()}: </b></p>\n`
      } else {
        content += `<p class="text-blue-500 text-lg"><b>${msg.role.toUpperCase()}: </b></p>\n`
      }
      for (const p of msg.contentParts) {
        if (p.type === 'tool-call') {
          if (renderedToolCalls.has(p.toolCallId)) {
            continue
          }
          const summary = toolCallSummaries.get(p.toolCallId)
          if (!summary) {
            continue
          }
          content += renderToolCallHtml(summary)
          renderedToolCalls.add(p.toolCallId)
          continue
        }
        if (p.type === 'text') {
          content += ReactDOMServer.renderToStaticMarkup(
            <MantineProvider>
              <BlockCodeCollapsedStateProvider defaultCollapsed={false}>
                {/* 导出页面没有 theme，代码块应该总是使用 dark 否则 color scheme 看不清 */}
                <Markdown hiddenCodeActions forceColorScheme="dark">
                  {p.text}
                </Markdown>
              </BlockCodeCollapsedStateProvider>
            </MantineProvider>
          )
        } else if (p.type === 'image') {
          if (p.storageKey) {
            let url = ''
            const b64 = await storage.getBlob(p.storageKey)
            if (b64) {
              let { type, data } = base64.parseImage(b64)
              if (type === '') {
                type = 'image/png'
                data = b64
              }
              url = `data:${type};base64,${data}`
            } else if ('url' in p) {
              url = p.url as string
            }
            content += `<img src="${url}" class="my-2" />\n`
          }
        }
      }
      if (attachments.length > 0) {
        content += '<div class="mt-2">\n'
        content += '<p class="font-semibold text-sm mb-1">Attachments:</p>\n'
        content += '<ul class="list-disc pl-6 text-sm text-slate-600">\n'
        for (const name of attachments) {
          content += `<li>${escapeHtml(name)}</li>\n`
        }
        content += '</ul>\n'
        content += '</div>\n'
      }
      content += '</div>\n'
    }
    content += '<hr />\n'
  }
  content += '</div>\n'
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${sessionName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <script>
        tailwind.config = {
        }
    </script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <link rel="shortcut icon" href="https://chatboxai.app/icon.png">
</head>
<body class='bg-slate-100'>
    <div class='mx-auto max-w-5xl shadow-md prose bg-white px-2 py-4'>
        <h1 class='flex flex-row justify-between items-center my-4 h-8'>
            <span>${sessionName}</span>
            <a href="https://chatboxai.app" target="_blank" >
                <img src='https://chatboxai.app/icon.png' class="w-12">
            </a>
        </h1>
        <hr />
        ${content}
        <hr />
        <a href="https://chatboxai.app" style="display: flex; align-items: center;" class="text-sky-500" target="_blank">
            <img src='https://chatboxai.app/icon.png' class="w-12 pr-2">
            <b style='font-size:30px'>Chatbox AI</b>
        </a>
        <p><a a href="https://chatboxai.app" target="_blank">https://chatboxai.app</a></p>
    </div>
</body>
</html>
`
}
