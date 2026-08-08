import { escapeSingleQuotes } from './shell'

export function buildReadFileScript(filePath: string, startLine: number, endLine: number): string {
  const escapedPath = escapeSingleQuotes(filePath)
  return [
    `FILE='${escapedPath}'`,
    'if [ ! -f "$FILE" ]; then exit 1; fi',
    'set -o pipefail',
    'TOTAL=$(LC_ALL=C wc -l < "$FILE") || exit 1',
    'if [ -s "$FILE" ]; then',
    '  LAST_BYTE_NEWLINES=$(tail -c 1 < "$FILE" | LC_ALL=C wc -l) || exit 1',
    '  if [ "$LAST_BYTE_NEWLINES" -eq 0 ]; then TOTAL=$((TOTAL + 1)); fi',
    'fi',
    `printf '%s\\n' "$TOTAL"`,
    `sed -n '${startLine},${endLine}p' "$FILE"`,
  ].join('\n')
}
