import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const sharedDir = join(root, 'src/shared')

const forbiddenSpecifiers = [
  '@/',
  'src/renderer',
  'src/main',
  'src/preload',
  '@capacitor/',
  '@capacitor-community/',
  'electron',
  '@mantine/',
  '@tanstack/react-router',
]

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])

function hasSourceExtension(filePath) {
  return [...sourceExtensions].some((extension) => filePath.endsWith(extension))
}

function walk(dirPath) {
  const entries = readdirSync(dirPath)
  return entries.flatMap((entry) => {
    const fullPath = join(dirPath, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      return walk(fullPath)
    }
    return hasSourceExtension(fullPath) ? [fullPath] : []
  })
}

function findViolations(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const importMatches = text.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)
  const dynamicImportMatches = text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)
  const specifiers = [...importMatches, ...dynamicImportMatches].map((match) => match[1])

  return specifiers
    .filter((specifier) => forbiddenSpecifiers.some((forbidden) => specifier === forbidden || specifier.startsWith(forbidden)))
    .map((specifier) => ({
      file: relative(root, filePath),
      specifier,
    }))
}

const violations = walk(sharedDir).flatMap(findViolations)

if (violations.length > 0) {
  console.error('Shared boundary check failed. src/shared must stay independent from renderer/native host code.')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.specifier}`)
  }
  process.exit(1)
}

console.log('Shared boundary check passed.')
