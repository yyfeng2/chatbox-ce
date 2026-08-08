import { describe, expect, test } from 'vitest'
import { toTextModelOutput } from './model-output'

describe('toTextModelOutput', () => {
  test('preserves non-empty formatted text', () => {
    const toModelOutput = toTextModelOutput(() => 'Result text')

    expect(toModelOutput({ output: {} })).toEqual({
      type: 'text',
      value: 'Result text',
    })
  })

  test('coerces empty formatted text to a non-empty sentinel', () => {
    const toModelOutput = toTextModelOutput(() => '')

    expect(toModelOutput({ output: {} })).toEqual({
      type: 'text',
      value: '[Tool returned no output.]',
    })
  })

  test('coerces whitespace-only formatted text to a non-empty sentinel', () => {
    const toModelOutput = toTextModelOutput(() => ' \n\t ')

    expect(toModelOutput({ output: {} })).toEqual({
      type: 'text',
      value: '[Tool returned no output.]',
    })
  })

  test('uses a tool-specific fallback for empty formatted text', () => {
    const toModelOutput = toTextModelOutput(() => '', { emptyFallback: 'No matches found.' })

    expect(toModelOutput({ output: {} })).toEqual({
      type: 'text',
      value: 'No matches found.',
    })
  })
})
