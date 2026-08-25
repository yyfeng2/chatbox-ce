import { MantineProvider } from '@mantine/core'
import { escape as escapeHtml } from 'lodash'
import ReactDOMServer from 'react-dom/server'
import Markdown, { BlockCodeCollapsedStateProvider } from '@/components/Markdown'
import * as base64 from '@/packages/base64'
import storage from '@/storage'
import type { Message, SessionThread } from '../../shared/types'
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

async function renderMessageHtml(msg: Message): Promise<string> {
  const attachments = getAttachmentNames(msg)
  const toolCallSummaries = collectToolCallSummaries(msg)
  const renderedToolCalls = new Set<string>()
  let html = '<div class="mb-4">\n'
  if (msg.role !== 'assistant') {
    html += `<p class="text-green-500 text-lg"><b>${msg.role.toUpperCase()}: </b></p>\n`
  } else {
    html += `<p class="text-blue-500 text-lg"><b>${msg.role.toUpperCase()}: </b></p>\n`
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
      html += renderToolCallHtml(summary)
      renderedToolCalls.add(p.toolCallId)
      continue
    }
    if (p.type === 'text') {
      html += ReactDOMServer.renderToStaticMarkup(
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
        html += `<img src="${url}" class="my-2" />\n`
      }
    }
  }
  if (attachments.length > 0) {
    html += '<div class="mt-2">\n'
    html += '<p class="font-semibold text-sm mb-1">Attachments:</p>\n'
    html += '<ul class="list-disc pl-6 text-sm text-slate-600">\n'
    for (const name of attachments) {
      html += `<li>${escapeHtml(name)}</li>\n`
    }
    html += '</ul>\n'
    html += '</div>\n'
  }
  html += '</div>\n'
  return html
}

/**
 * Tab bar shown above the exported HTML when the conversation has saved reply
 * branches. Lets the reader switch between the full thread and each alternative
 * reply path without duplicating content.
 */
function buildBranchTabBar(branchCount: number): string {
  let html = '<div class="branch-tabs" style="margin-bottom:16px;">\n'
  html += `<button class="branch-tab active" data-target="all" type="button">${escapeHtml('全部回复路径')}</button>\n`
  for (let k = 0; k < branchCount; k++) {
    html += `<button class="branch-tab" data-target="branch-${k + 1}" type="button">${escapeHtml(`分支 ${k + 1}`)}</button>\n`
  }
  html += '</div>\n'
  return html
}

export async function formatChatAsHtml(sessionName: string, threads: SessionThread[]) {
  // Fork branches are exported as standalone threads whose id starts with
  // "branch-"; keep them separate so they can be shown as switchable views.
  const branchThreads = threads.filter((thread) => thread.id.startsWith('branch-'))
  const mainThreads = threads.filter((thread) => !thread.id.startsWith('branch-'))
  const hasBranches = branchThreads.length > 0

  const sections: string[] = []

  const renderThread = async (thread: SessionThread, viewAttr: string) => {
    let section = `<section class="export-view" ${viewAttr}>\n`
    section += `<h2>${escapeHtml(thread.name)}</h2>\n`
    for (const msg of thread.messages) {
      section += await renderMessageHtml(msg)
    }
    section += '</section>\n'
    sections.push(section)
  }

  for (const thread of mainThreads) {
    await renderThread(thread, 'data-view="all"')
  }
  for (let k = 0; k < branchThreads.length; k++) {
    await renderThread(branchThreads[k], `data-view="branch-${k + 1}"`)
  }

  const tabBar = hasBranches ? buildBranchTabBar(branchThreads.length) : ''
  const body = `<div class="prose-sm">\n${tabBar}${sections.join('')}</div>\n`

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
    <style>
        .branch-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .branch-tab { padding: 4px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; cursor: pointer; font-size: 13px; }
        .branch-tab.active { background: #0ea5e9; border-color: #0ea5e9; color: white; font-weight: 600; }
    </style>
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
        ${body}
        <hr />
        <a href="https://chatboxai.app" style="display: flex; align-items: center;" class="text-sky-500" target="_blank">
            <img src='https://chatboxai.app/icon.png' class="w-12 pr-2">
            <b style='font-size:30px'>Chatbox AI</b>
        </a>
        <p><a a href="https://chatboxai.app" target="_blank">https://chatboxai.app</a></p>
    </div>
    <script>
        (function () {
            var tabs = document.querySelectorAll('.branch-tab');
            var views = document.querySelectorAll('.export-view');
            function showView(target) {
                views.forEach(function (view) {
                    var isMain = view.getAttribute('data-view') === 'all';
                    view.style.display = target === 'all' || view.getAttribute('data-view') === target ? '' : 'none';
                });
                tabs.forEach(function (tab) {
                    tab.classList.toggle('active', tab.getAttribute('data-target') === target);
                });
            }
            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    showView(tab.getAttribute('data-target'));
                });
            });
        })();
    </script>
</body>
</html>
`
}
