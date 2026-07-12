import type { PageBlueprint, SectionCopy, SectionKind, SectionPlan, ThemeTokens } from './schema'
import { BODY_FONTS, DISPLAY_FONTS } from './fonts'
import { contractCardFor, vocabularyTableCompact, type ClampedParams } from './vocabulary'

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
   Common mistake: reaching for \`document.querySelector(...)\` out of habit.
   ALWAYS use \`root.querySelector(...)\` / \`root.querySelectorAll(...)\` instead —
   never \`document.\` anywhere, even inside a callback.
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
   (stack columns with a media query). position:sticky is ONLY allowed when
   your intent above is sticky-card-stack — this section's intent is
   "${section.animation.intent}", so ${
     section.animation.intent === 'sticky-card-stack'
       ? 'position:sticky IS allowed here.'
       : 'do NOT use position:sticky anywhere in this section.'
   }
8. CSS must NOT hide anything (no opacity:0 / visibility:hidden). ALL initial
   hidden/offset states are set in JS via gsap.set() at the top of your function
   — the page must be fully readable if your JS never runs.
   WRONG: \`.reveal{opacity:0}\` in the CSS block.
   RIGHT: no opacity/visibility rule for \`.reveal\` in CSS at all; instead, the
   first line of your JS does \`gsap.set(els, { autoAlpha: 0, ... })\`.
9. Budget: HTML <= 120 lines, CSS <= 120 lines, JS <= 80 lines — these are hard
   caps enforced by the linter, so aim comfortably under them (~80/90/50) rather
   than writing right up to the limit.

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

/* ---------- Planner (§5.1) ---------- */

const PLANNER_SYSTEM = `You are the creative director and planner for a premium landing-page generator.
You produce award-site-caliber page plans (think Awwwards/godly.website energy):
confident type, restrained palettes, one or two bold scroll moments — never a
carnival. You respond with a single JSON object and nothing else.`

export function buildPlannerPrompt(userPrompt: string): ChatPrompt {
  const user = `Design a landing page plan as JSON for this brief:

BRIEF: ${userPrompt}

== ANIMATION VOCABULARY (choose intents ONLY from this table) ==
${vocabularyTableCompact()}

== COMPOSITION RULES ==
- 4 to 7 sections. First section kind: "hero". Last: "footer" or "cta".
- At most ONE pinned intent (horizontal-scroll-track | pinned-step-sequence |
  reverse-scroll-reveal) per page. Place it mid-page on the section with the
  most showable content.
- Heavy sections (pinned, sticky-card-stack, scrub-choreography): max 2, never adjacent.
- Hero uses an entrance intent (split-text-reveal, fade-up-stagger, mask-wipe, scale-settle).
- At least a third of sections use "none" or "fade-up-stagger" — pacing beats spectacle.
- count-up-stats only on a "stats" section. theme-shift: max 2, never adjacent.
- Params must respect the ranges in the vocabulary table.

== THEME RULES ==
- Pick mode "dark" unless the brief clearly wants light. Palette: bg and surface
  close in value; ONE accent used sparingly; text/muted with real contrast (WCAG AA
  against bg). All colors 6-digit hex.
- Fonts strictly from: display ∈ [${DISPLAY_FONTS.join(', ')}], body ∈ [${BODY_FONTS.join(', ')}].

== OUTPUT: a single JSON object with EXACTLY this shape ==
{
  "meta": { "title": str<=70, "description": str<=160 },
  "tone": "2-4 adjectives + register, e.g. 'confident, technical, quietly premium; short sentences'",
  "theme": { "mode": "dark|light",
             "colors": { "bg": hex, "surface": hex, "text": hex, "muted": hex,
                         "accent": hex, "accentContrast": hex },
             "fonts": { "display": str, "body": str }, "radius": int 0-32 },
  "sections": [ { "id": "kebab-slug", "kind": "<SectionKind>",
                  "contentBrief": "1-2 sentences: what this section must communicate",
                  "layoutHint": "optional, <=120 chars",
                  "animation": { "intent": "<intent-id>", "params": { ... }, "note": "optional art direction" }
                } ]
}

== EXAMPLE (different brief: "landing page for a monospace font foundry") ==
{"meta":{"title":"Grid Type — Fonts for Terminal Romantics","description":"A type foundry for monospace faces with actual personality."},
 "tone":"dry, precise, a little nerdy; short declarative sentences",
 "theme":{"mode":"dark","colors":{"bg":"#0a0a0b","surface":"#141416","text":"#f2f2ef","muted":"#8a8a86","accent":"#c8ff4d","accentContrast":"#0a0a0b"},"fonts":{"display":"Space Grotesk","body":"IBM Plex Sans"},"radius":4},
 "sections":[
  {"id":"hero","kind":"hero","contentBrief":"Foundry name and thesis: monospace fonts designed for reading, not just code.","animation":{"intent":"split-text-reveal","params":{"unit":"chars","stagger":0.03},"note":"characters land like keystrokes"}},
  {"id":"specimens","kind":"showcase","contentBrief":"Three flagship typefaces shown as large specimens with one-line personalities.","layoutHint":"full-bleed specimen rows","animation":{"intent":"pinned-step-sequence","params":{"steps":3},"note":"each specimen takes over like a slide"}},
  {"id":"features","kind":"feature-grid","contentBrief":"Ligatures, powerline glyphs, italics that don't apologize — four concrete features.","animation":{"intent":"fade-up-stagger","params":{"distance":32}}},
  {"id":"stats","kind":"stats","contentBrief":"Adoption numbers: downloads, editors supported, glyph count.","animation":{"intent":"count-up-stats","params":{}}},
  {"id":"cta","kind":"cta","contentBrief":"Try every face free for 30 days.","animation":{"intent":"fade-up-stagger","params":{}}},
  {"id":"footer","kind":"footer","contentBrief":"Minimal footer: license, contact, colophon.","animation":{"intent":"none","params":{}}}]}

Respond with JSON only. No markdown, no commentary.`

  return { system: PLANNER_SYSTEM, user }
}

/* ---------- Copywriter (§5.2) ---------- */

export interface CopywriterInput {
  userPrompt: string
  blueprint: PageBlueprint
}

const COPYWRITER_SYSTEM = `You are a senior conversion copywriter for high-end product sites. Punchy, concrete,
zero filler. You never write "Unlock the power of", "Elevate your", "seamless",
"revolutionize", or "in today's fast-paced world". You respond with a single JSON
object and nothing else.`

export function buildCopywriterPrompt(input: CopywriterInput): ChatPrompt {
  const { userPrompt, blueprint } = input
  const sectionsList = blueprint.sections
    .map(
      (s) =>
        `- id: "${s.id}" · kind: ${s.kind} · brief: ${s.contentBrief} · animation: ${s.animation.intent}`,
    )
    .join('\n')

  const user = `Write the copy for this page as JSON.

ORIGINAL BRIEF: ${userPrompt}
PAGE TONE: ${blueprint.tone}
PAGE TITLE: ${blueprint.meta.title}

SECTIONS (write copy for EVERY id, in order — same ids, no extras, none missing):
${sectionsList}

== FIELD RULES ==
- Every section: "headline" (required). Others only where they earn their place.
- Headline lengths are animation-aware:
  · split-text-reveal with unit "chars": headline <= 4 words
  · split-text-reveal (words/lines): headline <= 8 words
  · everything else: headline <= 10 words
- kind "feature-grid" | "process" | "faq": 3-6 "items" [{title, body?}]. Item titles <= 6 words.
- kind "stats": 3-4 "stats" [{value, label}] — value is a short numeral string ("12k+", "99.9%").
- kind "logos": 5-8 "items" with title only (company-ish names).
- kind "cta": include "cta" {label <= 4 words, sub optional}.
- kind "footer": headline = short sign-off line; optionally 3-5 items (nav labels).
- Sentence case. No exclamation marks. No emoji.

== OUTPUT: single JSON object ==
{ "sections": [ { "id": str, "eyebrow"?: str, "headline": str, "subheadline"?: str,
                  "body"?: str, "items"?: [{"title": str, "body"?: str}],
                  "stats"?: [{"value": str, "label": str}],
                  "cta"?: {"label": str, "sub"?: str} } ] }

Respond with JSON only.`

  return { system: COPYWRITER_SYSTEM, user }
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
