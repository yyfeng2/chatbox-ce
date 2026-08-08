import { createStore, useStore } from 'zustand'
import { delay } from '@/utils'
import * as scrollActions from './scrollActions'

// Ephemeral UI state that links pending approval cards in the message list with the
// floating approval pill above the input box: whether a card's Approve/Deny actions
// are visible in the viewport (the pill shows when they are not), which card should
// play the rotating locate ring after the pill's "View" action, and which pending
// approval the user nudged by clicking the locked input.
//
// A card can be mounted more than once (message list + search dialog), so visibility
// and the element registry are keyed per component instance under each toolCallId.

type ApprovalAttentionState = {
  /** toolCallId → component instances whose actions row intersects the viewport. */
  visibleActionInstances: Record<string, Record<string, true>>
  /** Card that should play the temporary locate ring (after "View" finds it). */
  highlightedToolCallId: string | null
  /**
   * Approval the user nudged by clicking the locked input — the strongest "I want
   * to continue" signal, so the pill shows even while the card is visible. Keyed by
   * toolCallId, the signal invalidates itself when the pending target changes.
   */
  nudgedToolCallId: string | null
}

export const approvalAttentionStore = createStore<ApprovalAttentionState>(() => ({
  visibleActionInstances: {},
  highlightedToolCallId: null,
  nudgedToolCallId: null,
}))

export function setApprovalActionsVisible(toolCallId: string, instanceId: string, visible: boolean) {
  approvalAttentionStore.setState((state) => {
    const instances = state.visibleActionInstances[toolCallId] ?? {}
    if (visible === Boolean(instances[instanceId])) return state
    const nextInstances = { ...instances }
    if (visible) {
      nextInstances[instanceId] = true
    } else {
      delete nextInstances[instanceId]
    }
    const visibleActionInstances = { ...state.visibleActionInstances }
    if (Object.keys(nextInstances).length > 0) {
      visibleActionInstances[toolCallId] = nextInstances
    } else {
      delete visibleActionInstances[toolCallId]
    }
    return { visibleActionInstances }
  })
}

export function useIsApprovalCardVisible(toolCallId: string): boolean {
  return useStore(approvalAttentionStore, (state) => Boolean(state.visibleActionInstances[toolCallId]))
}

/** Long enough for the rotating locate ring to complete about two laps. */
const HIGHLIGHT_DURATION_MS = 5000
let highlightTimer: ReturnType<typeof setTimeout> | null = null

export function flashApprovalCardHighlight(toolCallId: string) {
  if (highlightTimer) clearTimeout(highlightTimer)
  approvalAttentionStore.setState({ highlightedToolCallId: toolCallId })
  highlightTimer = setTimeout(() => {
    highlightTimer = null
    approvalAttentionStore.setState((state) =>
      state.highlightedToolCallId === toolCallId ? { highlightedToolCallId: null } : state
    )
  }, HIGHLIGHT_DURATION_MS)
}

export function useApprovalCardHighlighted(toolCallId: string): boolean {
  return useStore(approvalAttentionStore, (state) => state.highlightedToolCallId === toolCallId)
}

export function notifyApprovalInputNudge(toolCallId: string) {
  approvalAttentionStore.setState({ nudgedToolCallId: toolCallId })
}

export function clearApprovalInputNudge() {
  approvalAttentionStore.setState({ nudgedToolCallId: null })
}

export function useApprovalNudged(toolCallId: string): boolean {
  return useStore(approvalAttentionStore, (state) => state.nudgedToolCallId === toolCallId)
}

// Registry of mounted actions-row elements, written by the same effect that runs the
// IntersectionObserver. revealApprovalCard scrolls to a registered element instead of
// querying the DOM, so runtime behavior never depends on automation test ids.
const approvalActionElements = new Map<string, Map<string, HTMLElement>>()

export function registerApprovalActionsElement(toolCallId: string, instanceId: string, element: HTMLElement) {
  let instances = approvalActionElements.get(toolCallId)
  if (!instances) {
    instances = new Map()
    approvalActionElements.set(toolCallId, instances)
  }
  instances.set(instanceId, element)
}

export function unregisterApprovalActionsElement(toolCallId: string, instanceId: string) {
  const instances = approvalActionElements.get(toolCallId)
  if (!instances) return
  instances.delete(instanceId)
  if (instances.size === 0) approvalActionElements.delete(toolCallId)
}

function getApprovalActionsElement(toolCallId: string): HTMLElement | undefined {
  const instances = approvalActionElements.get(toolCallId)
  if (!instances) return undefined
  return instances.values().next().value
}

const REVEAL_LOOKUP_ATTEMPTS = 12
const REVEAL_LOOKUP_INTERVAL_MS = 50
/** Mantine Collapse animates for 200ms by default; wait a little longer than that. */
const REVEAL_EXPAND_SETTLE_MS = 250

/**
 * Scroll the message list to the approval card's actions and flash the locate ring.
 * The card may be unmounted (virtualized list), so first jump to the message, then
 * wait for the actions element to register before centering on it. Highlighting comes
 * first: the step component reacts to it by expanding collapsed details, and the
 * scroll waits for that expansion so the card lands centered at its final height.
 */
export async function revealApprovalCard(sessionId: string, messageId: string, toolCallId: string): Promise<void> {
  flashApprovalCardHighlight(toolCallId)
  let target = getApprovalActionsElement(toolCallId)
  if (!target) {
    await scrollActions.scrollToMessage(sessionId, messageId, 'center', 'auto')
    for (let attempt = 0; attempt < REVEAL_LOOKUP_ATTEMPTS && !target; attempt++) {
      await delay(REVEAL_LOOKUP_INTERVAL_MS)
      target = getApprovalActionsElement(toolCallId)
    }
  }
  if (!target) return
  // Only wait for the Collapse transition when the actions still need to come on screen.
  if (!approvalAttentionStore.getState().visibleActionInstances[toolCallId]) {
    await delay(REVEAL_EXPAND_SETTLE_MS)
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
