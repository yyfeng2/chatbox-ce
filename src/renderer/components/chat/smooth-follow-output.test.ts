import { describe, expect, it, vi } from 'vitest'
import { createSmoothFollowOutputController } from './smooth-follow-output'

function createHarness(behavior: 'auto' | 'smooth' = 'smooth') {
  const frames = new Map<number, FrameRequestCallback>()
  const scrollToBottom = vi.fn()
  const stopScrolling = vi.fn()
  let nextFrameId = 1
  const controller = createSmoothFollowOutputController({
    scrollToBottom,
    stopScrolling,
    requestFrame: (callback) => {
      const frameId = nextFrameId++
      frames.set(frameId, callback)
      return frameId
    },
    cancelFrame: (frameId) => {
      frames.delete(frameId)
    },
    getScrollBehavior: () => behavior,
  })

  const runFrames = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(0))
  }

  return { controller, frames, runFrames, scrollToBottom, stopScrolling }
}

describe('smooth follow output controller', () => {
  it('smoothly follows height growth after reaching the bottom', () => {
    const { controller, runFrames, scrollToBottom } = createHarness()

    controller.handleHeightChange(400)
    controller.handleAtBottomChange(true)
    controller.handleHeightChange(420)
    runFrames()

    expect(scrollToBottom).toHaveBeenCalledOnce()
    expect(scrollToBottom).toHaveBeenCalledWith('smooth')
  })

  it('does not pull the user back after they scroll upward', () => {
    const { controller, frames, runFrames, scrollToBottom, stopScrolling } = createHarness()

    controller.handleAtBottomChange(true)
    controller.handleScroll(200, 200)
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    expect(frames.size).toBe(1)

    expect(controller.handleScroll(150, 200)).toBe(true)
    expect(stopScrolling).toHaveBeenCalledOnce()
    expect(stopScrolling).toHaveBeenCalledWith(150)
    expect(frames.size).toBe(0)

    controller.handleHeightChange(440)
    runFrames()

    expect(controller.isFollowing()).toBe(false)
    expect(scrollToBottom).not.toHaveBeenCalled()

    controller.handleAtBottomChange(false)
    controller.handleHeightChange(460)
    runFrames()
    expect(scrollToBottom).not.toHaveBeenCalled()

    controller.handleAtBottomChange(true)
    controller.handleHeightChange(480)
    runFrames()
    expect(controller.isFollowing()).toBe(false)
    expect(scrollToBottom).not.toHaveBeenCalled()

    controller.handleScroll(200, 200)
    controller.handleHeightChange(500)
    runFrames()
    expect(controller.isFollowing()).toBe(true)
    expect(scrollToBottom).toHaveBeenCalledOnce()
  })

  it('does not resume when a layout shrink puts a user-paused viewport at the bottom', () => {
    const { controller, runFrames, scrollToBottom } = createHarness()

    controller.handleAtBottomChange(true)
    controller.handleScroll(200, 200)
    controller.handleScroll(150, 200)

    controller.handleScroll(120, 120)
    controller.handleAtBottomChange(true)
    controller.handleHeightChange(480)
    runFrames()

    expect(controller.isFollowing()).toBe(false)
    expect(scrollToBottom).not.toHaveBeenCalled()
  })

  it('resumes when the user scrolls back to within the at-bottom threshold', () => {
    const { controller, runFrames, scrollToBottom } = createHarness()

    controller.handleAtBottomChange(true)
    controller.handleScroll(200, 200)
    controller.handleScroll(150, 200)
    expect(controller.isFollowing()).toBe(false)

    // Fractional device pixel ratios leave a sub-pixel gap between the integer max scroll top and the
    // fractional scroll top, so an exact match never arrives.
    controller.handleScroll(197, 200)

    expect(controller.isFollowing()).toBe(true)
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    runFrames()
    expect(scrollToBottom).toHaveBeenCalledOnce()
  })

  it('does not resume when layout shrink reaches the bottom after a partial downward scroll', () => {
    const { controller, runFrames, scrollToBottom } = createHarness()

    controller.handleAtBottomChange(true)
    controller.handleScroll(200, 200)
    controller.handleScroll(150, 200)
    expect(controller.isFollowing()).toBe(false)

    // Moving downward does not count as returning to the bottom until the scroll event itself reaches the
    // shared threshold. A later layout shrink must not reuse that earlier downward movement as user intent.
    controller.handleScroll(180, 200)
    expect(controller.isFollowing()).toBe(false)

    controller.handleScroll(180, 180)
    controller.handleAtBottomChange(true)

    expect(controller.isFollowing()).toBe(false)
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    runFrames()
    expect(scrollToBottom).not.toHaveBeenCalled()
  })

  it('does not abort a deliberate navigation scroll that paused following first', () => {
    const { controller, stopScrolling } = createHarness()

    controller.handleAtBottomChange(true)
    controller.handleScroll(200, 200)
    controller.pause()
    expect(controller.handleScroll(150, 200)).toBe(true)

    expect(stopScrolling).not.toHaveBeenCalled()
  })

  it('keeps following when a layout shrink clamps the scroll position upward', () => {
    const { controller, runFrames, scrollToBottom, stopScrolling } = createHarness()

    controller.resume()
    controller.handleScroll(200, 200)
    expect(controller.handleScroll(150, 150)).toBe(false)
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    runFrames()

    expect(controller.isFollowing()).toBe(true)
    expect(stopScrolling).not.toHaveBeenCalled()
    expect(scrollToBottom).toHaveBeenCalledWith('smooth')
  })

  it('coalesces multiple height changes into one scroll per animation frame', () => {
    const { controller, frames, runFrames, scrollToBottom } = createHarness()

    controller.resume()
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    controller.handleHeightChange(440)

    expect(frames.size).toBe(1)
    runFrames()
    expect(scrollToBottom).toHaveBeenCalledOnce()
  })

  it('uses the configured instant scroll behavior', () => {
    const { controller, runFrames, scrollToBottom } = createHarness('auto')

    controller.resume()
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    runFrames()

    expect(scrollToBottom).toHaveBeenCalledWith('auto')
  })

  it('cancels a pending scroll when disposed', () => {
    const { controller, frames, runFrames, scrollToBottom } = createHarness()

    controller.resume()
    controller.handleHeightChange(400)
    controller.handleHeightChange(420)
    controller.dispose()
    expect(frames.size).toBe(0)
    runFrames()

    expect(scrollToBottom).not.toHaveBeenCalled()
  })
})
