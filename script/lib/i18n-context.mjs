/**
 * Build-time helper for context-aware i18n translation.
 *
 * Maps each translation key (the English source string) to the source file(s)
 * that use it, so script/translate.mjs can group keys by UI screen/component and
 * feed that location as context to the translator.
 *
 * Pure stdlib (no `ai`/`zod`) so `--selftest` runs without installed deps.
 *
 * Key usage forms covered:
 *   - t('...') / t("...") / t(`...`)   (no `${}` interpolation)
 *   - <Trans i18nKey="..."> / i18nKey='...'
 * Dynamic keys (t(variable), i18nKey={expr}, concatenations, src/.../for-key-scan.ts)
 * can't be statically mapped — they fall through to the 'common' group in groupKeys().
 */
import fs from 'node:fs'
import path from 'node:path'

// A balanced single/double/backtick string literal (with JS escapes).
const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`[^\`]*\``
const T_CALL = new RegExp(String.raw`\bt\(\s*(${STR})`, 'g')
const I18N_KEY = new RegExp(String.raw`i18nKey\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`, 'g')

function restoreLiteral(literal) {
  // Dynamic template (`...${x}...`) is not a static key.
  if (literal[0] === '`' && literal.includes('${')) return null
  try {
    // ponytail: build-time eval of ONE captured string-literal token from our own
    // trusted source. Correctly handles every JS escape form (\', \n, \\, multi-line
    // templates) that hand-rolled unescaping gets wrong. The regex guarantees `literal`
    // is a single balanced string token, so this only ever yields a string value.
    const v = new Function(`return ${literal}`)()
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

/** Extract candidate key strings from one file's source text (before intersection). */
export function extractCandidates(content) {
  const out = []
  for (const re of [T_CALL, I18N_KEY]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      const s = restoreLiteral(m[1])
      if (s) out.push(s)
    }
  }
  return out
}

/**
 * Walk srcDir, map every key that is BOTH used in source AND present in enKeys.
 * @param {string} srcDir e.g. 'src/renderer'
 * @param {Set<string>} enKeys keys from en/translation.json (the source of truth)
 * @returns {Map<string, Set<string>>} key -> set of repo-relative posix file paths
 */
export function scanKeyFileIndex(srcDir, enKeys, { repoRoot = process.cwd() } = {}) {
  const keyToFiles = new Map()
  const entries = fs.readdirSync(srcDir, { recursive: true })
  for (const entry of entries) {
    const name = String(entry)
    if (!/\.(ts|tsx)$/.test(name)) continue
    if (/\.(test|spec)\.|\.d\.ts$/.test(name)) continue
    const full = path.join(srcDir, name)
    let content
    try {
      content = fs.readFileSync(full, 'utf-8')
    } catch {
      continue // entry was a directory or vanished
    }
    const rel = path.relative(repoRoot, full).split(path.sep).join('/')
    for (const cand of extractCandidates(content)) {
      if (!enKeys.has(cand)) continue // intersection filter: drop mis-scanned strings
      if (!keyToFiles.has(cand)) keyToFiles.set(cand, new Set())
      keyToFiles.get(cand).add(rel)
    }
  }
  return keyToFiles
}

/**
 * Group keys for batch translation. Each group shares UI context (one file's
 * keys), except 'common' which holds generic strings used app-wide or nowhere
 * statically mappable.
 *
 * @param {string[]} enKeys all keys to group
 * @param {Map<string, Set<string>>} keyToFiles from scanKeyFileIndex()
 * @param {{ sharedThreshold?: number }} opts keys used in >threshold files => 'common'
 * @returns {Map<string, string[]>} groupLabel ('common' | repo-relative file) -> sorted keys
 */
export function groupKeys(enKeys, keyToFiles, { sharedThreshold = 4 } = {}) {
  // How many keys each file owns — used to pick the most specific file on ties.
  const fileKeyCount = new Map()
  for (const files of keyToFiles.values()) {
    for (const f of files) fileKeyCount.set(f, (fileKeyCount.get(f) || 0) + 1)
  }

  const groups = new Map()
  for (const key of enKeys) {
    const files = keyToFiles.get(key)
    let label
    if (!files || files.size === 0 || files.size > sharedThreshold) {
      label = 'common'
    } else {
      // Most specific = file with the fewest keys; ties broken by path order.
      label = [...files].sort((a, b) => fileKeyCount.get(a) - fileKeyCount.get(b) || (a < b ? -1 : 1))[0]
    }
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(key)
  }

  // Deterministic key order within each group (stable diffs).
  for (const keys of groups.values()) keys.sort()
  return groups
}

// Roles whose English text alone is ambiguous and whose register/length the model
// most often gets wrong. Only clean-signal sources (see plan §"role"): JSX
// attribute name, <Tooltip label>, and error keys. Button/title-from-children is
// intentionally NOT detected (needs AST, ~10 sites, low ROI — use // i18n: instead).
const ATTR_ROLE = { placeholder: 'input placeholder', 'aria-label': 'accessibility label (aria-label)' }
const ROLE_ATTR = new RegExp(String.raw`(\b[\w-]+)=\{\s*t\(\s*(${STR})`, 'g')
const TOOLTIP = new RegExp(String.raw`<Tooltip\b[^>]*?\blabel=\{\s*t\(\s*(${STR})`, 'gs')
// Highest priority wins when a key is used in several roles (rare, ~18% multi-file).
const ROLE_PRIORITY = ['input placeholder', 'tooltip', 'accessibility label (aria-label)', 'error/notice message']

/** Extract [candidate, role] pairs from one file's source (attribute + tooltip roles). */
export function extractRoles(content) {
  const out = []
  let m
  ROLE_ATTR.lastIndex = 0
  while ((m = ROLE_ATTR.exec(content)) !== null) {
    const role = ATTR_ROLE[m[1]]
    const cand = restoreLiteral(m[2])
    if (role && cand) out.push([cand, role])
  }
  TOOLTIP.lastIndex = 0
  while ((m = TOOLTIP.exec(content)) !== null) {
    const cand = restoreLiteral(m[1])
    if (cand) out.push([cand, 'tooltip'])
  }
  return out
}

/**
 * Map keys to their UI role, for the clean-signal subset only.
 * @returns {Map<string, string>} key -> single highest-priority role phrase
 */
export function scanKeyRoles(srcDir, enKeys, { errorFile = 'i18n/for-key-scan.ts' } = {}) {
  const roles = new Map() // key -> Set<role>
  const add = (cand, role) => {
    if (!cand || !enKeys.has(cand)) return
    if (!roles.has(cand)) roles.set(cand, new Set())
    roles.get(cand).add(role)
  }
  for (const entry of fs.readdirSync(srcDir, { recursive: true })) {
    const name = String(entry)
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.|\.d\.ts$/.test(name)) continue
    let content
    try {
      content = fs.readFileSync(path.join(srcDir, name), 'utf-8')
    } catch {
      continue
    }
    if (name.split(path.sep).join('/').endsWith(errorFile)) {
      for (const cand of extractCandidates(content)) add(cand, 'error/notice message')
    }
    for (const [cand, role] of extractRoles(content)) add(cand, role)
  }
  const out = new Map()
  for (const [k, set] of roles) {
    const role = ROLE_PRIORITY.find((r) => set.has(r))
    if (role) out.set(k, role)
  }
  return out
}

// --- self-check: `node script/lib/i18n-context.mjs --selftest` ---
if (process.argv.includes('--selftest')) {
  const assert = await import('node:assert/strict').then((m) => m.default)

  // extractCandidates: covers t() with single/double/template quotes, i18nKey=,
  // multi-line + escaped content, and rejects dynamic templates.
  const src = [
    `t('A single')`,
    `t("B double")`,
    't(`C template`)',
    `<Trans i18nKey="D attr" />`,
    `t(\`E \${dynamic}\`)`, // dynamic template -> ignored
    `t('F it\\'s escaped')`, // escaped single quote -> F it's escaped
    `const x = format('not a key')`, // 'not a key' captured but filtered by intersection later
  ].join('\n')
  const cands = extractCandidates(src)
  assert.ok(cands.includes('A single'), 'single-quoted t()')
  assert.ok(cands.includes('B double'), 'double-quoted t()')
  assert.ok(cands.includes('C template'), 'template t()')
  assert.ok(cands.includes('D attr'), 'i18nKey attr')

  // extractRoles: attribute name + Tooltip; ignores non-whitelisted attrs (label/title).
  const roleSrc = [
    `<TextInput placeholder={t('Search models')} />`,
    `<ActionIcon aria-label={t('Close panel')} />`,
    `<Tooltip label={t('Copy to clipboard')}><Button/></Tooltip>`,
    `<Text title={t('Some title')} />`, // title not whitelisted -> no role
    `<Field label={t('Plain label')} />`, // bare label (not Tooltip) -> no role
  ].join('\n')
  const roles = Object.fromEntries(extractRoles(roleSrc))
  assert.equal(roles['Search models'], 'input placeholder', 'placeholder role')
  assert.equal(roles['Close panel'], 'accessibility label (aria-label)', 'aria-label role')
  assert.equal(roles['Copy to clipboard'], 'tooltip', 'tooltip role')
  assert.ok(!('Some title' in roles), 'title not roled')
  assert.ok(!('Plain label' in roles), 'bare label not roled')
  assert.ok(cands.includes("F it's escaped"), 'escaped quote restored')
  assert.ok(!cands.some((c) => c.includes('dynamic')), 'dynamic template ignored')

  // groupKeys: 0 files -> common; >threshold files -> common; specific file wins.
  const keyToFiles = new Map([
    ['k_unmapped', new Set()],
    ['k_shared', new Set(['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx', 'e.tsx'])], // 5 > 4
    ['k_specific', new Set(['big.tsx', 'small.tsx'])],
    ['k_big1', new Set(['big.tsx'])],
    ['k_big2', new Set(['big.tsx'])], // big.tsx owns 3 keys, small.tsx owns 1
  ])
  const groups = groupKeys(['k_unmapped', 'k_shared', 'k_specific', 'k_big1', 'k_big2'], keyToFiles)
  assert.deepEqual(groups.get('common').sort(), ['k_shared', 'k_unmapped'], '0 and >4 files -> common')
  assert.ok(groups.get('small.tsx')?.includes('k_specific'), 'tie -> fewest-key (most specific) file wins')

  console.log('i18n-context selftest OK')
  process.exit(0)
}
