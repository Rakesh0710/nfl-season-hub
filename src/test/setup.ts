/**
 * Test environment setup, loaded once per Vitest worker.
 *
 * jsdom implements no layout and no canvas, so anything the app measures or
 * paints has to be given a believable answer here rather than in each test —
 * otherwise every component that touches the replay would need the same
 * scaffolding, and a test would be describing the stubs instead of the app.
 */

import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

/** jsdom has no ResizeObserver; the replay uses one to size the canvas. */
class TestResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    // Report a plausible card size straight away, which is what a real
    // ResizeObserver does when it begins observing.
    const entry = {
      target,
      contentRect: {
        width: 640,
        height: 320,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 320,
      },
    } as ResizeObserverEntry
    this.callback([entry], this)
  }
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = TestResizeObserver

/**
 * jsdom has no IntersectionObserver either, and the team page's sections fade
 * in when scrolled to. The stub reports every observed element as already in
 * view, which is a browser scrolled to the section — jsdom lays nothing out,
 * so no real observer could ever decide otherwise.
 */
class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = [0]
  readonly scrollMargin = ''
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    const entry = {
      target,
      isIntersecting: true,
      intersectionRatio: 1,
    } as IntersectionObserverEntry
    this.callback([entry], this)
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
globalThis.IntersectionObserver = TestIntersectionObserver

/**
 * A no-op 2D context. The drawing code is tested directly against a recording
 * context in replayCanvas.test.ts; component tests only need `getContext` to
 * return something, so the calls the loop makes do not throw.
 */
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => null,
) as unknown as typeof HTMLCanvasElement.prototype.getContext

/** jsdom has neither, and the replay loop and count-ups both need them. */
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia
}
