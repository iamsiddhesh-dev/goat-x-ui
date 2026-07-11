import type { SectionCopy, SectionKind, SectionPlan, ThemeTokens } from './schema'
import { contractCardFor, type ClampedParams } from './vocabulary'

/* ============================================================================
 * Prompt templates (AGENT_SPEC §5). Phase 2 owns the Code Generator (§5.3) and
 * the shared Repair prompt (§5.4). Codegen output is delimited blocks, NOT JSON
 * (the payload IS code — escaping multi-line JS/CSS through JSON strings is the
 * pipeline's #1 failure risk).
 * ========================================================================== */

export interface ChatPrompt {
  system: string
  user: string
}

export interface CodegenInput {
  tone: string
  theme: ThemeTokens
  /** Section plan; its animation.params must already be clamped. */
  section: SectionPlan
  clampedParams: ClampedParams
  copy: SectionCopy
  prevKind?: SectionKind
  nextKind?: SectionKind
}

const CODEGEN_SYSTEM = `You are an elite creative developer who hand-writes GSAP ScrollTrigger animations
for award-winning marketing sites. You write modern, minimal, intentional code.
You follow the runtime contract EXACTLY — violations are discarded by a linter.
You output exactly three delimited blocks and nothing else.`

export function buildCodegenPrompt(input: CodegenInput): ChatPrompt {
  const { tone, theme, section, clampedParams, copy } = input
  const card = contractCardFor(section.animation.intent, clampedParams)
  const copyJson = JSON.stringify(copy, null, 2)

  const user = `Write ONE landing-page section: markup, scoped styles, and a GSAP init function body.

== PAGE CONTEXT ==
Tone: ${tone}
Theme: mode ${theme.mode} · CSS variables ALREADY defined for you:
  var(--bg) var(--surface) var(--text) var(--muted) var(--accent) var(--accent-contrast)
  var(--font-display) var(--font-body) var(--radius)
Neighbors: previous section = ${input.prevKind ?? '(none)'}, next = ${input.nextKind ?? '(none)'}.

== THIS SECTION ==
id: "${section.id}" · kind: ${section.kind}
layoutHint: ${section.layoutHint ?? '(your call)'}
art direction: ${section.animation.note ?? '(none)'}

COPY (use verbatim — every field below must appear in the HTML; invent nothing):
${copyJson}

== ANIMATION CONTRACT ==
${card}

== RUNTIME CONTRACT (hard rules — a linter rejects violations) ==
1. Your JS is the BODY of \`function (root) { ... }\`. \`gsap\`, \`ScrollTrigger\`,
   \`SplitText\` are globals. It runs inside gsap.context(root): bare selector
   strings in gsap calls are auto-scoped to this section. For direct DOM access
   use root.querySelector / root.querySelectorAll ONLY.
2. FORBIDDEN anywhere in JS: document. window. parent. fetch( import eval(
   setTimeout( setInterval( localStorage innerHTML Lenis ScrollTrigger.refresh
   ScrollTrigger.scrollerProxy gsap.registerPlugin
3. Animate ONLY transforms (x, y, xPercent, yPercent, scale, rotate, skewX),
   opacity/autoAlpha, clipPath. Never width/height/top/left/margin/fontSize.
4. Eases: power1-4 .out/.inOut, expo.out, sine.out/.inOut, back.out(1.2-2), none.
   Scrubbed tweens: ease "none".
5. Every ScrollTrigger: trigger is root or a descendant. Entrance animations:
   once: true. Pinning (only if your contract card allows): pin: root,
   anticipatePin: 1 — never pin inner elements.
6. HTML: exactly one root element:
   <section data-section="${section.id}" class="s-${section.id}"> … </section>
   Semantic tags. No <script>, no <style>, no inline event handlers.
   Prefer CSS-built visuals (gradients, borders, shapes) over images; if an image
   is essential: https://picsum.photos/seed/${section.id}/1200/800
7. CSS: prefix every rule with .s-${section.id}. Use the CSS variables for ALL
   colors/fonts. No position:fixed. Desktop-first, must not break at 375px
   (stack columns with a media query).
8. CSS must NOT hide anything (no opacity:0 / visibility:hidden). ALL initial
   hidden/offset states are set in JS via gsap.set() at the top of your function
   — the page must be fully readable if your JS never runs.
9. Budget: HTML <= 120 lines, CSS <= 120 lines, JS <= 80 lines.

== OUTPUT FORMAT (exactly this, no commentary, no markdown fences) ==
===HTML===
<section data-section="${section.id}" class="s-${section.id}">
...
</section>
===CSS===
...
===JS===
...
===END===`

  return { system: CODEGEN_SYSTEM, user }
}

/* ---------- Repair prompt (§5.4) — one retry, shared across stages ---------- */

const REPAIR_SYSTEM = `You fix machine-rejected output. You change ONLY what the errors require and
preserve everything else. Same output format as the original task.`

export function buildRepairPrompt(args: {
  originalUser: string
  previousRaw: string
  errors: string[]
}): ChatPrompt {
  const errorList = args.errors.map((e) => `- ${e}`).join('\n')
  const user = `Your previous output for the task below was rejected by an automated validator.

== ORIGINAL TASK ==
${args.originalUser}

== YOUR PREVIOUS OUTPUT ==
${args.previousRaw}

== VALIDATOR ERRORS (fix ALL of these) ==
${errorList}

Return the FULL corrected output in the original required format. Output only that.`
  return { system: REPAIR_SYSTEM, user }
}
