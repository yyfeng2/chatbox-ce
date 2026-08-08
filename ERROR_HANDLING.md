# Error handling and Sentry

The current error-reporting architecture, classification, sampling, deduplication, and privacy rules are documented in [`docs/technical/sentry-error-reporting.md`](docs/technical/sentry-error-reporting.md).

The Sentry SDK owns global browser error and unhandled-rejection capture. Do not add parallel `window` listeners or intercept `console.error`; explicit handled failures should use `reportError()` with stable domain and operation tags.
