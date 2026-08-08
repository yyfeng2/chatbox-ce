/**
 * Stable automation surface for Chatbox UI.
 *
 * IDs describe user-facing semantics rather than component libraries, copy, or layout.
 * Dynamic domain identity belongs in adjacent data-* attributes (for example modelId),
 * never in a generated test ID.
 */

export const AUTOMATION_CONTRACT_ID = 'chatbox-ui'
export const AUTOMATION_CONTRACT_VERSION = '1.1.0'
export const AUTOMATION_CONTRACT_VERSION_ATTRIBUTE = 'data-automation-contract-version'

export type AutomationReasoningLevel = 'default' | 'off' | 'low' | 'medium' | 'high'

export const TestId = {
  chat: {
    messageInput: 'message-input',
    send: 'message-send',
    stop: 'message-stop',
    attachmentMenuTrigger: 'attachment-menu-trigger',
    attachmentSelectImage: 'attachment-select-image',
    attachmentSelectFile: 'attachment-select-file',
    attachmentImageInput: 'attachment-image-input',
    attachmentFileInput: 'attachment-file-input',
    webSearchToggle: 'web-search-toggle',
  },
  model: {
    selectorTrigger: 'model-selector-trigger',
    selectorPanel: 'model-selector-panel',
    searchInput: 'model-search-input',
    option: 'model-option',
    optionName: 'model-option-name',
  },
  agent: {
    modeTrigger: 'agent-mode-trigger',
    modePanel: 'agent-mode-panel',
    modeChat: 'agent-mode-chat',
    modeWork: 'agent-mode-work',
  },
  reasoning: {
    trigger: 'reasoning-control-trigger',
    menu: 'reasoning-control-menu',
    level: (level: AutomationReasoningLevel) => `reasoning-level-${level}`,
  },
  sidebar: {
    root: 'sidebar',
    newChat: 'new-chat-button',
    newImage: 'new-image-button',
    settingsTrigger: 'settings-trigger',
    sessionItem: 'session-item',
    sessionTitle: 'session-title',
    sessionPin: 'session-pin',
    sessionArchive: 'session-archive',
  },
  message: {
    item: 'message-item',
    content: 'message-content',
    actionBar: 'message-action-bar',
    actionMenu: 'message-action-menu',
    deleteConfirmation: 'message-delete-confirmation',
    actionBarRetry: 'message-action-bar-retry',
    actionBarRetryBelow: 'message-action-bar-retry-below',
    actionBarEdit: 'message-action-bar-edit',
    actionBarCopy: 'message-action-bar-copy',
    actionMenuRetry: 'message-action-menu-retry',
    actionMenuRetryBelow: 'message-action-menu-retry-below',
    actionMenuEdit: 'message-action-menu-edit',
    actionMenuCopy: 'message-action-menu-copy',
    actionMore: 'message-action-more',
    actionQuote: 'message-action-quote',
    actionDelete: 'message-action-delete',
    actionDeleteConfirm: 'message-action-delete-confirm',
  },
  toolCall: {
    approvalCard: 'tool-call-approval-card',
    approve: 'tool-call-approve',
    continue: 'tool-call-continue',
    deny: 'tool-call-deny',
    dontAskAgain: 'tool-call-dont-ask-again',
    dontAskAgainSession: 'tool-call-dont-ask-again-session',
    dontAskAgainGlobal: 'tool-call-dont-ask-again-global',
    approvalPill: 'tool-call-approval-pill',
    approvalPillView: 'tool-call-approval-pill-view',
    approvalPillApprove: 'tool-call-approval-pill-approve',
    approvalPillDeny: 'tool-call-approval-pill-deny',
  },
  settings: {
    pauseOnToolCallLimitSwitch: 'settings-pause-on-tool-call-limit',
    sessionPauseOnToolCallLimitSwitch: 'session-settings-pause-on-tool-call-limit',
  },
} as const

export const AutomationContract = {
  id: AUTOMATION_CONTRACT_ID,
  version: AUTOMATION_CONTRACT_VERSION,
  testIds: TestId,
} as const

export function listStaticTestIds(value: unknown = TestId): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function' || !value || typeof value !== 'object') return []
  return Object.values(value).flatMap((entry) => listStaticTestIds(entry))
}
