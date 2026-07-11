import { SectionModule, type AnimationIntentId } from './schema'
import { isPinIntent } from './vocabulary'

/* ============================================================================
 * Validator + Repair gates (AGENT_SPEC §6, codegen rules §4.4).
 *
 * Deterministic checks over one section's raw codegen output. The doctrine:
 * every failure has a landing spot — a specific error string that feeds the ONE
 * allowed repair call; a second failure lands on the fallback skeleton upstream.
 *
 * Gates implemented here:
 *   F7  extractBlocks   — parse ===HTML===/===CSS===/===JS=== delimited output
 *   C6  checkHtmlRoot   — exactly one <section data-section> root, no banned tags
 *   F5  parseJs         — new Function('root', js) parse-only (never invoked)
 *   C1-C5,C8  lintJs    — forbidden tokens, property/ease whitelist, pin rule
 *   C7,C9,C8  lintCss   — no fixed/hidden, sticky gating, no CSS-hidden content
 *   F12 prefixCss       — auto-scope every generated selector with .s-{id}
 * ========================================================================== */

export interface SectionBlocks {
  html: string
  css: string
  js: string
}

export type ExtractResult =
  | { ok: true; blocks: SectionBlocks }
  | { ok: false; error: string }

/** Strip a single wrapping ```lang … ``` fence from a block, if present. */
function stripFence(block: string): string {
  const t = block.trim()
  const fenced = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return fenced ? fenced[1].trim() : t
}

/** F7 — pull the three delimited blocks out of the codegen output. */
export function extractBlocks(raw: string): ExtractResult {
  const m = raw.match(
    /===HTML===([\s\S]*?)===CSS===([\s\S]*?)===JS===([\s\S]*?)(?:===END===|$)/,
  )
  if (!m) {
    return {
      ok: false,
      error:
        'output must contain ===HTML===, ===CSS=== and ===JS=== delimiter blocks in that order',
    }
  }
  return {
    ok: true,
    blocks: {
      html: stripFence(m[1]),
      css: stripFence(m[2]),
      js: stripFence(m[3]),
    },
  }
}

/* ---------- C6: HTML root ---------- */

const BANNED_HTML = [
  { re: /<script[\s>]/i, msg: '<script> is not allowed in section HTML' },
  { re: /<style[\s>]/i, msg: '<style> is not allowed (use the CSS block)' },
  { re: /<link[\s>]/i, msg: '<link> is not allowed in section HTML' },
  { re: /<iframe[\s>]/i, msg: '<iframe> is not allowed' },
  { re: /\son[a-z]+\s*=/i, msg: 'inline event handlers (on*=) are not allowed' },
]

export function checkHtmlRoot(html: string, id: string): string[] {
  const errors: string[] = []
  const t = html.trim()

  if (!/^<section[\s>]/i.test(t) || !/<\/section>\s*$/i.test(t)) {
    errors.push(
      'HTML must be exactly one root <section …> … </section> element',
    )
  }

  const roots = t.match(/data-section\s*=/gi) ?? []
  if (roots.length !== 1) {
    errors.push(
      `HTML must have exactly one element with data-section (found ${roots.length})`,
    )
  } else {
    if (!new RegExp(`data-section\\s*=\\s*["']${id}["']`).test(t)) {
      errors.push(`root <section> must have data-section="${id}"`)
    }
    if (!new RegExp(`class\\s*=\\s*["'][^"']*\\bs-${id}\\b`).test(t)) {
      errors.push(`root <section> must include class "s-${id}"`)
    }
  }

  for (const b of BANNED_HTML) {
    if (b.re.test(t)) errors.push(b.msg)
  }
  return errors
}

/* ---------- F5: JS parse ---------- */

/** Parse-only (never invoked). Returns a SyntaxError message, or null if OK. */
export function parseJs(js: string): string | null {
  try {
    // eslint-disable-next-line no-new-func
    new Function('root', js)
    return null
  } catch (e) {
    return String((e as Error).message)
  }
}

/* ---------- C1-C5, C8: JS lint ---------- */

const FORBIDDEN_JS: Array<{ token: string; label?: string }> = [
  { token: 'document.' },
  { token: 'window.' },
  { token: 'parent.' },
  { token: 'globalThis' },
  { token: 'fetch(' },
  { token: 'XMLHttpRequest' },
  { token: 'eval(' },
  { token: 'localStorage' },
  { token: 'sessionStorage' },
  { token: 'setTimeout(' },
  { token: 'setInterval(' },
  { token: 'innerHTML' },
  { token: 'Lenis' },
  { token: 'lenis' },
  { token: 'ScrollTrigger.refresh' },
  { token: 'ScrollTrigger.scrollerProxy' },
  { token: 'ScrollTrigger.config' },
  { token: 'gsap.registerPlugin' },
]

// Non-transform CSS props that must never be animated (C2).
const BANNED_TWEEN_PROP =
  /[{,]\s*(width|height|top|left|right|bottom|margin|marginTop|marginBottom|padding|paddingTop|paddingBottom|fontSize|lineHeight)\s*:/g

// Allowed easing expressions (C3).
const EASE_OK =
  /^(none|expo\.out|sine\.(out|inOut)|power[1-4]\.(out|inOut)|back\.out\(([0-9]*\.?[0-9]+)\))$/

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

export function lintJs(js: string, intent: AnimationIntentId): string[] {
  const errors: string[] = []

  for (const { token, label } of FORBIDDEN_JS) {
    const idx = js.indexOf(token)
    if (idx !== -1) {
      errors.push(
        `forbidden token \`${label ?? token}\` at JS line ${lineOf(js, idx)}`,
      )
    }
  }
  // `import` as a statement/expression (avoid matching "important" etc.)
  const imp = js.match(/\bimport\b\s*[({.'"]/)
  if (imp && imp.index != null) {
    errors.push(`forbidden token \`import\` at JS line ${lineOf(js, imp.index)}`)
  }

  let m: RegExpExecArray | null
  BANNED_TWEEN_PROP.lastIndex = 0
  while ((m = BANNED_TWEEN_PROP.exec(js)) !== null) {
    errors.push(
      `banned animated property \`${m[1]}\` at JS line ${lineOf(js, m.index)} — animate transforms/opacity/clipPath only`,
    )
  }

  const easeRe = /ease\s*:\s*['"]([^'"]+)['"]/g
  while ((m = easeRe.exec(js)) !== null) {
    const ease = m[1]
    if (!EASE_OK.test(ease)) {
      errors.push(
        `ease "${ease}" is not on the whitelist (power1-4.out/.inOut, expo.out, sine.out/.inOut, back.out(x), none) at JS line ${lineOf(js, m.index)}`,
      )
    } else {
      const back = ease.match(/^back\.out\(([0-9]*\.?[0-9]+)\)$/)
      if (back) {
        const v = Number(back[1])
        if (v < 1.2 || v > 2) {
          errors.push(`back.out overshoot ${v} out of range 1.2–2`)
        }
      }
    }
  }

  const pinIdx = js.search(/\bpin\s*:/)
  if (pinIdx !== -1) {
    if (!isPinIntent(intent)) {
      errors.push(
        `pin is only allowed for pinned intents, not "${intent}" (JS line ${lineOf(js, pinIdx)})`,
      )
    } else if (!/\bpin\s*:\s*root\b/.test(js)) {
      errors.push('pin must be `pin: root` — never an inner element')
    }
  }

  const lines = js.split('\n').length
  if (lines > 80) errors.push(`JS is ${lines} lines (budget: 80)`)

  return errors
}

/* ---------- C7, C9, C8: CSS lint ---------- */

export function lintCss(css: string, intent: AnimationIntentId): string[] {
  const errors: string[] = []

  if (/opacity\s*:\s*0(?:\.0+)?\s*(?:!important)?\s*[;}]/.test(css)) {
    errors.push(
      'CSS must not set opacity:0 — initial hidden states belong in JS (rule C9)',
    )
  }
  if (/visibility\s*:\s*hidden/.test(css)) {
    errors.push(
      'CSS must not set visibility:hidden — initial hidden states belong in JS (rule C9)',
    )
  }
  if (/position\s*:\s*fixed/.test(css)) {
    errors.push('position:fixed is not allowed (rule C7)')
  }
  if (
    /position\s*:\s*sticky/.test(css) &&
    intent !== 'sticky-card-stack'
  ) {
    errors.push(
      `position:sticky is only allowed for sticky-card-stack, not "${intent}"`,
    )
  }

  const lines = css.split('\n').length
  if (lines > 120) errors.push(`CSS is ${lines} lines (budget: 120)`)

  return errors
}

/* ---------- F12: CSS prefixer ---------- */

function alreadyScoped(sel: string, scope: string): boolean {
  if (!sel.startsWith(scope)) return false
  const rest = sel.slice(scope.length)
  return rest === '' || /^[\s.:>~+,[]/.test(rest)
}

function prefixSelectorList(selectorList: string, scope: string): string {
  return selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (alreadyScoped(s, scope) ? s : `${scope} ${s}`))
    .join(', ')
}

function rewriteBlocks(css: string, scope: string): string {
  let out = ''
  let i = 0
  const n = css.length
  while (i < n) {
    let j = i
    while (j < n && css[j] !== '{') j++
    if (j >= n) {
      out += css.slice(i)
      break
    }
    const prelude = css.slice(i, j)
    let depth = 0
    let k = j
    for (; k < n; k++) {
      if (css[k] === '{') depth++
      else if (css[k] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const body = css.slice(j + 1, k)
    const trimmed = prelude.trim()
    const leadWs = prelude.slice(0, prelude.length - prelude.trimStart().length)
    const lower = trimmed.toLowerCase()

    if (trimmed.startsWith('@')) {
      if (
        lower.startsWith('@media') ||
        lower.startsWith('@supports') ||
        lower.startsWith('@container')
      ) {
        out += `${leadWs}${trimmed} {${rewriteBlocks(body, scope)}}`
      } else {
        // @keyframes / @font-face / @page — leave inner selectors untouched
        out += `${leadWs}${trimmed} {${body}}`
      }
    } else {
      out += `${leadWs}${prefixSelectorList(trimmed, scope)} {${body}}`
    }
    i = k + 1
  }
  return out
}

/** Auto-prefix every generated CSS rule with `.s-{id}` (idempotent). */
export function prefixCss(css: string, id: string): string {
  if (!css.trim()) return ''
  return rewriteBlocks(css, `.s-${id}`)
}

/* ---------- compose: validate one section module ---------- */

export interface ValidateResult {
  ok: boolean
  errors: string[]
  module?: SectionModule
}

/** Run the HTML/JS/CSS gates over already-extracted blocks; returns errors. */
export function validateParts(
  parts: SectionBlocks,
  opts: { id: string; intent: AnimationIntentId },
): string[] {
  const errors: string[] = []
  errors.push(...checkHtmlRoot(parts.html, opts.id))
  const parseErr = parseJs(parts.js)
  if (parseErr) errors.push(`JS SyntaxError: ${parseErr}`)
  errors.push(...lintJs(parts.js, opts.intent))
  errors.push(...lintCss(parts.css, opts.intent))
  return errors
}

/**
 * Run every gate over one raw codegen output. On success returns a fully-formed
 * SectionModule with CSS auto-prefixed. On failure returns the specific error
 * strings (fed verbatim to the repair prompt, §5.4).
 */
export function validateModule(
  raw: string,
  opts: {
    id: string
    intent: AnimationIntentId
    origin?: SectionModule['origin']
  },
): ValidateResult {
  const ex = extractBlocks(raw)
  if (!ex.ok) return { ok: false, errors: [ex.error] }

  const { html, css, js } = ex.blocks
  const errors = validateParts(ex.blocks, opts)

  if (errors.length) return { ok: false, errors }

  const candidate = {
    id: opts.id,
    html: html.trim(),
    css: prefixCss(css, opts.id),
    js: js.trim(),
    origin: opts.origin ?? 'generated',
  }
  const parsed = SectionModule.safeParse(candidate)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (iss) => `${iss.path.join('.')}: ${iss.message}`,
      ),
    }
  }
  return { ok: true, errors: [], module: parsed.data }
}
