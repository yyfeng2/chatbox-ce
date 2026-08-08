type FollowOutputScrollBehavior = 'auto' | 'smooth'

interface SmoothFollowOutputOptions {
  scrollToBottom: (behavior: FollowOutputScrollBehavior) => void
  stopScrolling?: (scrollTop: number) => void
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
  getScrollBehavior?: () => FollowOutputScrollBehavior
}

const SCROLL_DIRECTION_TOLERANCE = 0.5
const HEIGHT_CHANGE_TOLERANCE = 0.5
// Matches react-virtuoso's default `atBottomThreshold`, so this controller and the `atBottomStateChange`
// signal agree on what "at bottom" means. A tighter value would drift apart from Virtuoso on fractional
// device pixel ratios, where `scrollHeight - clientHeight` (integers) and `scrollTop` (fractional) leave a
// sub-pixel gap that never closes.
const AT_BOTTOM_TOLERANCE = 4

export function createSmoothFollowOutputController({
  scrollToBottom,
  stopScrolling,
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
  getScrollBehavior = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'),
}: SmoothFollowOutputOptions) {
  // Wait for a real at-bottom signal so restoring a session in the middle does not unexpectedly jump to the end.
  let following = false
  let pausedByUser = false
  let lastScrollTop: number | undefined
  let lastMaxScrollTop: number | undefined
  let lastHeight: number | undefined
  let pendingFrame: number | undefined

  const pause = () => {
    following = false
    if (pendingFrame !== undefined) {
      cancelFrame(pendingFrame)
      pendingFrame = undefined
    }
  }

  const resume = () => {
    following = true
    pausedByUser = false
  }

  const handleAtBottomChange = (atBottom: boolean) => {
    if (atBottom && !pausedByUser) {
      resume()
    }
  }

  const handleScroll = (scrollTop: number, maxScrollTop: number) => {
    const movedUp = lastScrollTop !== undefined && scrollTop < lastScrollTop - SCROLL_DIRECTION_TOLERANCE
    const movedDown = lastScrollTop !== undefined && scrollTop > lastScrollTop + SCROLL_DIRECTION_TOLERANCE
    const movedUpBecauseLayoutShrank =
      lastMaxScrollTop !== undefined && maxScrollTop < lastMaxScrollTop - HEIGHT_CHANGE_TOLERANCE
    lastScrollTop = scrollTop
    lastMaxScrollTop = maxScrollTop
    if (movedUp && !movedUpBecauseLayoutShrank) {
      const shouldStopScrolling = following
      pause()
      pausedByUser = true
      // Pausing future retargets is not enough: a native smooth scroll that is already running can
      // continue pulling the viewport downward. Pinning the current position aborts that animation.
      // Deliberate navigation calls pause() before starting its own smooth scroll and must not be aborted.
      if (shouldStopScrolling) {
        stopScrolling?.(scrollTop)
      }
    } else if (movedDown) {
      // Resume as soon as the user reaches the end, without waiting for Virtuoso's at-bottom callback.
      if (pausedByUser && maxScrollTop - scrollTop <= AT_BOTTOM_TOLERANCE) {
        resume()
      }
    }
    return movedUp && !movedUpBecauseLayoutShrank
  }

  const handleHeightChange = (height: number) => {
    const grew = lastHeight !== undefined && height > lastHeight + HEIGHT_CHANGE_TOLERANCE
    lastHeight = height
    if (!grew || !following || pendingFrame !== undefined) {
      return
    }

    // Streaming can trigger several measurements in one frame. Retarget the native smooth scroll only once.
    pendingFrame = requestFrame(() => {
      pendingFrame = undefined
      if (following) {
        scrollToBottom(getScrollBehavior())
      }
    })
  }

  const dispose = () => {
    if (pendingFrame !== undefined) {
      cancelFrame(pendingFrame)
      pendingFrame = undefined
    }
  }

  return {
    handleAtBottomChange,
    handleHeightChange,
    handleScroll,
    pause,
    resume,
    isFollowing: () => following,
    dispose,
  }
}
