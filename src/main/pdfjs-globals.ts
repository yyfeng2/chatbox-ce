// pdfjs-dist (used by file-parser.ts for local PDF text extraction) references
// browser canvas globals — DOMMatrix / Path2D / ImageData — at module top level
// (e.g. `const SCALE_MATRIX = new DOMMatrix()`).
//
// In the Electron MAIN process pdfjs detects `isNodeJS === true` (process.type is
// "browser") and tries to polyfill these from its optional `@napi-rs/canvas`
// dependency. That package is NOT shipped in the packaged app (it is only a dev
// dependency of pdfjs, not in release/app), so in production the polyfill fails and
// the top-level `new DOMMatrix()` throws "DOMMatrix is not defined", crashing main
// process startup (the production bundle inlines the dynamic pdfjs import, so this
// runs at load time rather than lazily).
//
// We only do local PDF *text extraction* (never rendering), which does not need a
// real canvas implementation — a minimal DOMMatrix plus empty Path2D/ImageData
// stubs are enough to let pdfjs load and extract text. Installing these globals
// here, and importing this module first in main.ts, satisfies pdfjs's
// `if (!globalThis.DOMMatrix)` guard before its top-level code runs, so it skips the
// @napi-rs/canvas path entirely and never crashes.
//
// This must be imported before any module that (transitively) loads pdfjs.

class DOMMatrixPolyfill {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  m11 = 1
  m12 = 0
  m13 = 0
  m14 = 0
  m21 = 0
  m22 = 1
  m23 = 0
  m24 = 0
  m31 = 0
  m32 = 0
  m33 = 1
  m34 = 0
  m41 = 0
  m42 = 0
  m43 = 0
  m44 = 1

  constructor(init?: number[] | string) {
    if (Array.isArray(init)) {
      if (init.length === 6) {
        ;[this.a, this.b, this.c, this.d, this.e, this.f] = init
        this.m11 = this.a
        this.m12 = this.b
        this.m21 = this.c
        this.m22 = this.d
        this.m41 = this.e
        this.m42 = this.f
      } else if (init.length === 16) {
        ;[
          this.m11,
          this.m12,
          this.m13,
          this.m14,
          this.m21,
          this.m22,
          this.m23,
          this.m24,
          this.m31,
          this.m32,
          this.m33,
          this.m34,
          this.m41,
          this.m42,
          this.m43,
          this.m44,
        ] = init
        this.a = this.m11
        this.b = this.m12
        this.c = this.m21
        this.d = this.m22
        this.e = this.m41
        this.f = this.m42
      }
    }
  }

  // Text extraction never invokes these (they are only used on the render path),
  // but provide chainable no-ops so any incidental call does not throw.
  multiplySelf() {
    return this
  }
  preMultiplySelf() {
    return this
  }
  translateSelf() {
    return this
  }
  translate() {
    return new DOMMatrixPolyfill()
  }
  scaleSelf() {
    return this
  }
  scale() {
    return new DOMMatrixPolyfill()
  }
  invertSelf() {
    return this
  }
}

class Path2DPolyfill {
  addPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
  rect() {}
}

class ImageDataPolyfill {
  width: number
  height: number
  data: Uint8ClampedArray
  constructor(width = 0, height = 0) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(Math.max(0, width * height * 4))
  }
}

const target = globalThis as Record<string, unknown>
if (typeof target.DOMMatrix === 'undefined') {
  target.DOMMatrix = DOMMatrixPolyfill
}
if (typeof target.Path2D === 'undefined') {
  target.Path2D = Path2DPolyfill
}
if (typeof target.ImageData === 'undefined') {
  target.ImageData = ImageDataPolyfill
}
