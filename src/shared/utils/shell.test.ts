import { describe, expect, test } from 'vitest'
import { escapeSingleQuotes, shellQuote } from './shell'

describe('shellQuote', () => {
  test('simple string', () => {
    expect(shellQuote('hello')).toBe("'hello'")
  })

  test('string with single quote', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  test('empty string', () => {
    expect(shellQuote('')).toBe("''")
  })

  test('shell metacharacters preserved literally', () => {
    expect(shellQuote('$HOME')).toBe("'$HOME'")
  })

  test('backticks preserved', () => {
    expect(shellQuote('`cmd`')).toBe("'`cmd`'")
  })

  test('semicolons preserved', () => {
    expect(shellQuote('a;b')).toBe("'a;b'")
  })

  test('newlines preserved within quotes', () => {
    expect(shellQuote('a\nb')).toBe("'a\nb'")
  })

  test('multiple consecutive quotes', () => {
    expect(shellQuote("''")).toBe("''\\'''\\'''")
  })
})

describe('escapeSingleQuotes', () => {
  test('no quotes returns unchanged', () => {
    expect(escapeSingleQuotes('hello')).toBe('hello')
  })

  test('single quote in middle', () => {
    expect(escapeSingleQuotes("it's")).toBe("it'\\''s")
  })

  test('leading quote', () => {
    expect(escapeSingleQuotes("'hello")).toBe("'\\''hello")
  })

  test('trailing quote', () => {
    expect(escapeSingleQuotes("hello'")).toBe("hello'\\''")
  })
})
