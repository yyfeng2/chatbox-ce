/**
 * Shell escaping utilities for sandbox command construction.
 *
 * Single-quote escaping is the safest approach for shell strings:
 * everything inside single quotes is literal (no variable expansion,
 * no command substitution). The only character that needs escaping
 * is the single quote itself, done by ending the quoted region,
 * inserting an escaped quote, and reopening.
 */

/** Escape a string for safe inclusion inside single-quoted bash. */
export function escapeSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''")
}

/** Wrap a string in single quotes with proper escaping. */
export function shellQuote(s: string): string {
  return `'${escapeSingleQuotes(s)}'`
}
