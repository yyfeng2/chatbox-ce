export function tokenizeShellWords(input: string): string[] | null {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (const char of input) {
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (/\s/.test(char) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (inSingle || inDouble) return null
  if (current) tokens.push(current)
  return tokens
}

export function extractCommandBaseName(commandToken: string): string {
  return commandToken.split('/').pop() ?? ''
}
