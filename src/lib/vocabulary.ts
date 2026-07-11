import type {
  AnimationIntentId,
  AnimationSpec,
  PageBlueprint,
  SectionCopy,
  SectionModule,
  SectionPlan,
  ThemeTokens,
  SectionKind,
} from './schema'

/* ============================================================================
 * Animation Vocabulary / Constraint Layer (AGENT_SPEC §4).
 *
 * Closed vocabulary, open choreography:
 *   1. Closed intent set (14) — the Planner cannot invent new intents.
 *   2. Clamped params — out-of-range values are CLAMPED, never rejected (§4.3).
 *   3. Structural code rules (§4.4) — enforced by the Validator (validate.ts).
 *
 * This module owns layers 1–2: the per-intent param table, `clampParams`, the
 * contract cards injected into the codegen prompt (§4.5), and the mapping to the
 * deterministic fallback skeletons (skeletons/). It is pure and LLM-free.
 *
 * Phase 2 fully implemented 6 intents (none, fade-up-stagger, split-text-reveal,
 * parallax-drift, pinned-step-sequence, marquee-loop); Phase 5 is filling in the
 * remaining 8 one at a time (mask-wipe done). All 14 have param specs (so
 * clampParams is TOTAL over all 14); unimplemented ones degrade to a generic
 * entrance card + skeleton until their dedicated cards/skeletons land.
 * ========================================================================== */

/* ---------- param specs ---------- */

export type NumberParam = {
  kind: 'number'
  min: number
  max: number
  default: number
  /** rendered into warnings/cards, e.g. "px", "s", "deg" */
  unit?: string
}
export type EnumParam = {
  kind: 'enum'
  values: readonly string[]
  default: string
  /** theme-shift `bg` also accepts a 6-digit hex */
  allowHex?: boolean
}
export type ParamDef = NumberParam | EnumParam

export type ClampedParams = Record<string, string | number | boolean>

export type IntentCategory =
  | 'entrance'
  | 'scroll-linked'
  | 'pinned'
  | 'ambient'
  | 'global'
  | 'none'

/** Per-intent param table (catalog §4.2). Total over all 14 intents. */
export const INTENT_PARAMS: Record<AnimationIntentId, Record<string, ParamDef>> =
  {
    none: {},
    'fade-up-stagger': {
      distance: { kind: 'number', min: 24, max: 80, default: 40, unit: 'px' },
      stagger: { kind: 'number', min: 0.06, max: 0.15, default: 0.08, unit: 's' },
      duration: { kind: 'number', min: 0.5, max: 1.0, default: 0.7, unit: 's' },
    },
    'split-text-reveal': {
      unit: { kind: 'enum', values: ['words', 'lines', 'chars'], default: 'words' },
      stagger: { kind: 'number', min: 0.02, max: 0.12, default: 0.06, unit: 's' },
      rotate: { kind: 'number', min: 0, max: 8, default: 0, unit: 'deg' },
    },
    'mask-wipe': {
      direction: {
        kind: 'enum',
        values: ['up', 'down', 'left', 'right'],
        default: 'up',
      },
      duration: { kind: 'number', min: 0.8, max: 1.4, default: 1.0, unit: 's' },
    },
    'scale-settle': {
      from: { kind: 'number', min: 1.06, max: 1.2, default: 1.12 },
      duration: { kind: 'number', min: 0.8, max: 1.6, default: 1.1, unit: 's' },
    },
    'parallax-drift': {
      intensity: {
        kind: 'enum',
        values: ['subtle', 'medium', 'strong'],
        default: 'medium',
      },
      layers: { kind: 'number', min: 2, max: 4, default: 3 },
    },
    'reverse-parallax': {
      intensity: {
        kind: 'enum',
        values: ['subtle', 'medium', 'strong'],
        default: 'subtle',
      },
    },
    'scrub-choreography': {
      smoothing: { kind: 'number', min: 0.5, max: 1.5, default: 1 },
    },
    'horizontal-scroll-track': {
      panels: { kind: 'number', min: 2, max: 5, default: 3 },
    },
    'pinned-step-sequence': {
      steps: { kind: 'number', min: 2, max: 4, default: 3 },
    },
    'sticky-card-stack': {
      cards: { kind: 'number', min: 2, max: 5, default: 3 },
    },
    'marquee-loop': {
      speedSec: { kind: 'number', min: 15, max: 40, default: 24, unit: 's' },
      direction: { kind: 'enum', values: ['left', 'right'], default: 'left' },
    },
    'count-up-stats': {
      duration: { kind: 'number', min: 1, max: 2, default: 1.4, unit: 's' },
    },
    'theme-shift': {
      bg: {
        kind: 'enum',
        values: ['surface', 'accent'],
        default: 'surface',
        allowHex: true,
      },
    },
  }

/** Category per intent (used by composition rules §4.6 + the validator). */
export const INTENT_CATEGORY: Record<AnimationIntentId, IntentCategory> = {
  none: 'none',
  'fade-up-stagger': 'entrance',
  'split-text-reveal': 'entrance',
  'mask-wipe': 'entrance',
  'scale-settle': 'entrance',
  'parallax-drift': 'scroll-linked',
  'reverse-parallax': 'scroll-linked',
  'scrub-choreography': 'scroll-linked',
  'horizontal-scroll-track': 'pinned',
  'pinned-step-sequence': 'pinned',
  'sticky-card-stack': 'scroll-linked',
  'marquee-loop': 'ambient',
  'count-up-stats': 'entrance',
  'theme-shift': 'global',
}

/** Intents that own a GSAP pin — only these may write `pin: root` (rule C4). */
export const PIN_INTENTS: ReadonlySet<AnimationIntentId> = new Set([
  'horizontal-scroll-track',
  'pinned-step-sequence',
])

export function isPinIntent(id: AnimationIntentId): boolean {
  return PIN_INTENTS.has(id)
}

/* ---------- clampParams (§4.3) ---------- */

/**
 * Validate + clamp a Planner-supplied param bag against the intent's spec.
 * NEVER throws. Numeric out-of-range → clamped to [min,max]; invalid enum →
 * default; unknown keys → dropped; missing keys → default. Every correction
 * appends a human-readable warning surfaced in the UI.
 */
export function clampParams(spec: AnimationSpec): {
  params: ClampedParams
  warnings: string[]
} {
  const defs = INTENT_PARAMS[spec.intent] ?? {}
  const raw = spec.params ?? {}
  const params: ClampedParams = {}
  const warnings: string[] = []

  for (const [name, def] of Object.entries(defs)) {
    const has = Object.prototype.hasOwnProperty.call(raw, name)
    if (def.kind === 'number') {
      let v = has ? Number(raw[name]) : def.default
      if (!Number.isFinite(v)) {
        if (has)
          warnings.push(
            `${spec.intent}.${name}: "${String(raw[name])}" is not a number → default ${def.default}`,
          )
        v = def.default
      } else if (v < def.min) {
        warnings.push(`${spec.intent}.${name}: ${v} clamped up to ${def.min}`)
        v = def.min
      } else if (v > def.max) {
        warnings.push(`${spec.intent}.${name}: ${v} clamped down to ${def.max}`)
        v = def.max
      }
      params[name] = v
    } else {
      let v = has ? String(raw[name]) : def.default
      const legal =
        def.values.includes(v) ||
        (def.allowHex === true && /^#[0-9a-fA-F]{6}$/.test(v))
      if (!legal) {
        if (has)
          warnings.push(
            `${spec.intent}.${name}: "${v}" invalid → default "${def.default}"`,
          )
        v = def.default
      }
      params[name] = v
    }
  }

  for (const name of Object.keys(raw)) {
    if (!(name in defs)) {
      warnings.push(`${spec.intent}.${name}: unknown param dropped`)
    }
  }

  return { params, warnings }
}

/* ---------- contract cards (§4.5) ---------- */

/**
 * A contract card is a ~30-line markdown block injected into the codegen prompt
 * for one section only. It states the load-bearing ScrollTrigger mechanics the
 * model MUST keep, what it is free to invent, and a reference skeleton that is
 * explicitly an example, not a template to fill.
 */
export type ContractCard = (params: ClampedParams) => string

/** The fully-hidden clip-path inset() for a mask-wipe direction (§4.2 #3). */
export function maskWipeHiddenInset(direction: string): string {
  if (direction === 'down') return 'inset(100% 0% 0% 0%)'
  if (direction === 'left') return 'inset(0% 100% 0% 0%)'
  if (direction === 'right') return 'inset(0% 0% 0% 100%)'
  return 'inset(0% 0% 100% 0%)' // up (default)
}

const CARDS: Partial<Record<AnimationIntentId, ContractCard>> = {
  none: () => `## INTENT: none
This section is static — NO JavaScript animation.
Return a JS block containing only a single no-op comment, e.g. \`// static section\`.
Focus entirely on clean, legible markup and layout. Nothing hidden in CSS.`,

  'fade-up-stagger': (p) => `## INTENT: fade-up-stagger
Direct children of a group rise and fade in, in sequence, when the section enters.
Clamped params: distance=${p.distance}px, stagger=${p.stagger}s, duration=${p.duration}s.

MECHANICS YOU MUST KEEP:
- Collect the elements to reveal (a class like '.reveal' on each). In JS, set their
  initial hidden state FIRST: gsap.set(els, { y: ${p.distance}, autoAlpha: 0 }).
- ONE ScrollTrigger with once: true. Because a hero can already be on-screen at
  load (its start sits at an unreachable negative scroll), guard it:
    var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
    if (st.isActive) { st.kill(); play(); }
- play() = gsap.to(els, { y: 0, autoAlpha: 1, duration: ${p.duration},
  stagger: ${p.stagger}, ease: 'power3.out' }).

YOURS TO INVENT:
- Which elements reveal and in what order, the layout, whether children share one
  stagger or nest (e.g. eyebrow → headline → sub → cta).

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var els = root.querySelectorAll('.reveal');
gsap.set(els, { y: ${p.distance}, autoAlpha: 0 });
function play(){ gsap.to(els, { y: 0, autoAlpha: 1, duration: ${p.duration}, stagger: ${p.stagger}, ease: 'power3.out' }); }
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
\`\`\``,

  'split-text-reveal': (p) => `## INTENT: split-text-reveal
The headline splits (SplitText) and reveals per ${p.unit} with a y-offset from behind a clip.
Clamped params: unit=${p.unit}, stagger=${p.stagger}s, rotate=${p.rotate}deg.

MECHANICS YOU MUST KEEP:
- SplitText is a global. Split the headline element:
    var split = new SplitText(root.querySelector('h1'), { type: '${p.unit}' });
  Use split.${p.unit} as the target array.
- Give each piece an overflow-clip parent OR animate yPercent behind the element's
  own overflow:hidden wrapper. Set initial hidden state in JS:
    gsap.set(split.${p.unit}, { yPercent: 120, autoAlpha: 0${Number(p.rotate) > 0 ? `, rotate: ${p.rotate}` : ''} }).
- ONE ScrollTrigger, once: true, with the same is-active guard as entrance intents.
- Reveal: gsap.to(split.${p.unit}, { yPercent: 0, autoAlpha: 1, rotate: 0,
  duration: 0.8, stagger: ${p.stagger}, ease: 'power4.out' }).

YOURS TO INVENT:
- The headline itself is fixed copy; invent the surrounding layout, the clip
  presentation, and any secondary elements (they may fade-up separately).

REFERENCE SKELETON — mechanics example ONLY:
\`\`\`js
var h = root.querySelector('h1');
var split = new SplitText(h, { type: '${p.unit}' });
gsap.set(split.${p.unit}, { yPercent: 120, autoAlpha: 0 });
function play(){ gsap.to(split.${p.unit}, { yPercent: 0, autoAlpha: 1, duration: 0.8, stagger: ${p.stagger}, ease: 'power4.out' }); }
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
\`\`\``,

  'parallax-drift': (p) => `## INTENT: parallax-drift
${p.layers} layers translate vertically at different rates as the section transits the viewport.
Clamped params: intensity=${p.intensity}, layers=${p.layers}.

MECHANICS YOU MUST KEEP:
- Give each layer a class (e.g. '.layer'); the further-back a layer, the more it drifts.
- ONE ScrollTrigger per layer OR one timeline, ALWAYS scrubbed (ease 'none'):
    { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true }.
- Drift is a yPercent tween only: gsap.to(layer, { yPercent: -N, ease: 'none',
  scrollTrigger: {...} }). Larger N for background layers. Intensity '${p.intensity}'
  ≈ base drift ${p.intensity === 'subtle' ? 8 : p.intensity === 'strong' ? 24 : 15}%.
- Never pin. Never animate anything but yPercent/y (+ optional opacity).

YOURS TO INVENT:
- What the layers ARE (headline, media, decorative shapes, gradient blobs) and
  their stacking. Content must be readable with JS off (no layer starts offset in CSS).

REFERENCE SKELETON — mechanics example ONLY:
\`\`\`js
var layers = root.querySelectorAll('.layer');
layers.forEach(function (el, i) {
  gsap.to(el, { yPercent: -(8 + i * 8), ease: 'none',
    scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });
});
\`\`\``,

  'pinned-step-sequence': (p) => `## INTENT: pinned-step-sequence
Section pins to the viewport; ${p.steps} content "steps" hand off as the user scrolls.
Clamped params: steps=${p.steps} (scrub smoothing fixed at 1).

MECHANICS YOU MUST KEEP (load-bearing ScrollTrigger shape):
- ONE timeline, ONE ScrollTrigger: { trigger: root, pin: root, scrub: 1,
  anticipatePin: 1, start: 'top top', end: '+=' + (${p.steps} * 100) + '%' }.
- Steps are absolutely positioned on top of each other inside a relatively
  positioned stage; step 1 visible initially via gsap.set in JS (rule C9).
  IMPORTANT: the absolute-stack layout must be opted into from JS (add a class to
  the stage in JS), so with JS off the steps flow as a readable vertical list.
- Each handoff = outgoing step animates out + incoming animates in, overlapping
  on the timeline ('<' / '-=' offsets). transform/opacity/clipPath only, ease 'none'.

YOURS TO INVENT (do not copy the reference layout):
- What a "step" is for THIS content, the handoff move (crossfade, slide-over,
  clip wipe, scale-swap), the pinned stage layout, any progress indicator.

REFERENCE SKELETON — mechanics example ONLY, copying its DOM/layout is a failure:
\`\`\`js
var stage = root.querySelector('.stage');
var steps = gsap.utils.toArray(root.querySelectorAll('.step'));
stage.classList.add('is-animated');
gsap.set(steps.slice(1), { autoAlpha: 0, yPercent: 12 });
var tl = gsap.timeline({ scrollTrigger: { trigger: root, pin: root, scrub: 1,
  anticipatePin: 1, start: 'top top', end: '+=' + (${p.steps} * 100) + '%' } });
steps.forEach(function (step, i) {
  if (i === 0) return;
  tl.to(steps[i - 1], { autoAlpha: 0, yPercent: -12, ease: 'none' })
    .to(step, { autoAlpha: 1, yPercent: 0, ease: 'none' }, '<0.2');
});
\`\`\``,

  'scale-settle': (p) => `## INTENT: scale-settle
An element settles from scale=${p.from} down to scale 1 with a fade, when the section enters.
Clamped params: from=${p.from}, duration=${p.duration}s.

MECHANICS YOU MUST KEEP:
- Pick ONE element to settle (e.g. the whole content group, or a media panel — a
  class like '.settle'). In JS, set its oversized+hidden state FIRST (rule C9):
    gsap.set(el, { scale: ${p.from}, autoAlpha: 0 }).
- ONE ScrollTrigger with once: true, guarded exactly like fade-up-stagger (a hero
  can already be on-screen at load):
    var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
    if (st.isActive) { st.kill(); play(); }
- play() = gsap.to(el, { scale: 1, autoAlpha: 1, duration: ${p.duration}, ease: 'power3.out' }).
- Only ONE element scales — do not stagger multiple independently-scaling
  children (that is fade-up-stagger's job, not this intent's).

YOURS TO INVENT:
- What settles (a hero visual, a single card, the whole copy block) and the
  surrounding layout. Content must be readable with JS off (no CSS transform).

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var el = root.querySelector('.settle');
gsap.set(el, { scale: ${p.from}, autoAlpha: 0 });
function play(){ gsap.to(el, { scale: 1, autoAlpha: 1, duration: ${p.duration}, ease: 'power3.out' }); }
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
\`\`\``,

  'mask-wipe': (p) => `## INTENT: mask-wipe
A media/panel element is revealed by an animated clip-path: inset() wipe as the section enters.
Clamped params: direction=${p.direction}, duration=${p.duration}s.

MECHANICS YOU MUST KEEP:
- Pick one element to wipe (e.g. a class like '.panel'). In JS, set its FULLY
  HIDDEN inset FIRST, before any ScrollTrigger fires (rule C9 — never in CSS):
    gsap.set(panel, { clipPath: '${maskWipeHiddenInset(String(p.direction))}' }).
- ONE ScrollTrigger with once: true, guarded for above-the-fold sections exactly
  like fade-up-stagger:
    var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
    if (st.isActive) { st.kill(); play(); }
- play() tweens clipPath to the fully-revealed rect:
    gsap.to(panel, { clipPath: 'inset(0% 0% 0% 0%)', duration: ${p.duration}, ease: 'power4.out' }).
- clip-path is the ONLY property this intent animates. Never animate width/
  height/top/left/right/bottom directly (banned tween properties, rule C2).

YOURS TO INVENT:
- What the wiped element IS (image placeholder, gradient panel, card) and the
  surrounding layout/copy. Content must be readable with JS off (no CSS clip).

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var panel = root.querySelector('.panel');
gsap.set(panel, { clipPath: '${maskWipeHiddenInset(String(p.direction))}' });
function play(){ gsap.to(panel, { clipPath: 'inset(0% 0% 0% 0%)', duration: ${p.duration}, ease: 'power4.out' }); }
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
\`\`\``,

  'marquee-loop': (p) => `## INTENT: marquee-loop
An infinite horizontal marquee (logos / keywords) drifting ${p.direction}.
Clamped params: speedSec=${p.speedSec}, direction=${p.direction}.

MECHANICS YOU MUST KEEP:
- This is AMBIENT (time-based) — NO ScrollTrigger at all.
- Render the item list TWICE inside one track so the loop is seamless.
- Animate the track with xPercent from 0 to ${p.direction === 'left' ? -50 : 50}
  using gsap.to(track, { xPercent: ${p.direction === 'left' ? -50 : 50},
  duration: ${p.speedSec}, ease: 'none', repeat: -1 }).
- The wrapper must have overflow: hidden. transform only.

YOURS TO INVENT:
- What the marquee items are (logo chips, keyword pills), their styling and gaps,
  optional edge fade masks.

REFERENCE SKELETON — mechanics example ONLY:
\`\`\`js
var track = root.querySelector('.track');
gsap.to(track, { xPercent: ${p.direction === 'left' ? -50 : 50}, duration: ${p.speedSec}, ease: 'none', repeat: -1 });
\`\`\``,
}

/** Generic entrance card for intents whose dedicated card is not written yet. */
const GENERIC_CARD: ContractCard = (p) =>
  (CARDS['fade-up-stagger'] as ContractCard)(
    Object.keys(p).length ? p : { distance: 40, stagger: 0.08, duration: 0.7 },
  )

/** The contract card for a section's intent, params pre-clamped. */
export function contractCardFor(
  intent: AnimationIntentId,
  params: ClampedParams,
): string {
  const card = CARDS[intent] ?? GENERIC_CARD
  return card(params)
}

/** Whether Phase 2 ships a dedicated contract card + skeleton for this intent. */
export const IMPLEMENTED_INTENTS: ReadonlySet<AnimationIntentId> = new Set([
  'none',
  'fade-up-stagger',
  'split-text-reveal',
  'mask-wipe',
  'scale-settle',
  'parallax-drift',
  'pinned-step-sequence',
  'marquee-loop',
])

/* ---------- fallback skeletons (§4.5) ---------- */

/** Everything a deterministic skeleton needs to emit a known-good module. */
export interface SkeletonInput {
  id: string
  kind: SectionKind
  copy: SectionCopy
  theme: ThemeTokens
  params: ClampedParams
}
export type SectionSkeletonFn = (input: SkeletonInput) => SectionModule

/* ---------- compact catalog table (for the Planner prompt, §5.1) ---------- */

function paramSummary(defs: Record<string, ParamDef>): string {
  const parts = Object.entries(defs).map(([name, d]) =>
    d.kind === 'number'
      ? `${name} ${d.min}-${d.max}${d.unit ?? ''} (${d.default})`
      : `${name} ${d.values.join('|')} (${d.default})`,
  )
  return parts.length ? parts.join(', ') : '—'
}

/** One compact line per intent: `id · category · params`. */
export function vocabularyTableCompact(): string {
  return (Object.keys(INTENT_PARAMS) as AnimationIntentId[])
    .map(
      (id) =>
        `- ${id} · ${INTENT_CATEGORY[id]} · ${paramSummary(INTENT_PARAMS[id])}`,
    )
    .join('\n')
}

/* ============================================================================
 * Composition rules (AGENT_SPEC §4.6) + Planner post-processing (§6, §8 Phase 3).
 *
 * Order per §6 "Per-stage gate summary": parse → Zod → clamp params (F3) →
 * composition rules R1–R7 auto-correct → unique-id check (dedupe). All of these
 * are auto-CORRECTIONS, never rejections — every fix appends a warning.
 * ========================================================================== */

/** Hero-eligible entrance intents (R2). */
const ENTRANCE_HERO_INTENTS: ReadonlySet<AnimationIntentId> = new Set([
  'fade-up-stagger',
  'split-text-reveal',
  'mask-wipe',
  'scale-settle',
])

/** "Heavy" intents (R1): pin-based + sticky-card-stack + scrub-choreography. */
const HEAVY_INTENTS: ReadonlySet<AnimationIntentId> = new Set([
  'horizontal-scroll-track',
  'pinned-step-sequence',
  'sticky-card-stack',
  'scrub-choreography',
])

function isPacingIntent(intent: AnimationIntentId): boolean {
  return intent === 'none' || intent === 'fade-up-stagger'
}

/** Rebuild a section's animation with a new intent, defaulted params (§4.3). */
function withIntent(section: SectionPlan, intent: AnimationIntentId): SectionPlan {
  const { params } = clampParams({ intent, params: {} })
  return { ...section, animation: { ...section.animation, intent, params } }
}

/** Apply clampParams (§4.3, F3) to every section's animation params. */
export function clampBlueprintParams(blueprint: PageBlueprint): {
  blueprint: PageBlueprint
  warnings: string[]
} {
  const warnings: string[] = []
  const sections = blueprint.sections.map((s) => {
    const { params, warnings: w } = clampParams(s.animation)
    warnings.push(...w)
    return { ...s, animation: { ...s.animation, params } }
  })
  return { blueprint: { ...blueprint, sections }, warnings }
}

function enforceHeavyLimit(
  sections: SectionPlan[],
  warnings: string[],
): SectionPlan[] {
  const out = sections.slice()
  let pinSeen = false
  let heavyCount = 0
  let prevHeavy = false
  for (let i = 0; i < out.length; i++) {
    const s = out[i]
    const intent = s.animation.intent
    const isPin = PIN_INTENTS.has(intent)
    const isHeavy = HEAVY_INTENTS.has(intent)
    let reason = ''
    if (isPin && pinSeen) reason = 'a second pinned intent is not allowed (R1)'
    else if (isHeavy && heavyCount >= 2)
      reason = 'more than two heavy sections is not allowed (R1)'
    else if (isHeavy && prevHeavy)
      reason = 'heavy sections cannot be adjacent (R1)'

    if (reason) {
      warnings.push(
        `section "${s.id}": intent "${intent}" demoted to fade-up-stagger — ${reason}`,
      )
      out[i] = withIntent(s, 'fade-up-stagger')
      prevHeavy = false
      continue
    }
    if (isPin) pinSeen = true
    prevHeavy = isHeavy
    if (isHeavy) heavyCount++
  }
  return out
}

/** Generic "at most `max`, never adjacent" enforcement for a single intent. */
function enforceSpacedLimit(
  sections: SectionPlan[],
  intent: AnimationIntentId,
  max: number,
  ruleTag: string,
  warnings: string[],
): SectionPlan[] {
  const out = sections.slice()
  let count = 0
  let prevMatched = false
  for (let i = 0; i < out.length; i++) {
    const s = out[i]
    if (s.animation.intent !== intent) {
      prevMatched = false
      continue
    }
    let reason = ''
    if (count >= max)
      reason = `more than ${max} "${intent}" section(s) is not allowed (${ruleTag})`
    else if (prevMatched)
      reason = `"${intent}" sections cannot be adjacent (${ruleTag})`

    if (reason) {
      warnings.push(
        `section "${s.id}": intent "${intent}" demoted to fade-up-stagger — ${reason}`,
      )
      out[i] = withIntent(s, 'fade-up-stagger')
      prevMatched = false
    } else {
      count++
      prevMatched = true
    }
  }
  return out
}

/** Loudness ranking used to pick R4 pacing-demotion candidates. */
function loudnessRank(intent: AnimationIntentId): number {
  if (isPacingIntent(intent)) return -1
  if (HEAVY_INTENTS.has(intent) || PIN_INTENTS.has(intent)) return 3
  const category = INTENT_CATEGORY[intent]
  if (category === 'scroll-linked' || category === 'global') return 2
  return 1
}

function enforcePacing(sections: SectionPlan[], warnings: string[]): SectionPlan[] {
  const out = sections.slice()
  const need = Math.ceil(out.length / 3)
  let pacingCount = out.filter((s) => isPacingIntent(s.animation.intent)).length
  if (pacingCount >= need) return out

  const candidates = out
    .map((s, i) => ({ i, rank: loudnessRank(s.animation.intent) }))
    .filter((c) => c.rank >= 0)
    .sort((a, b) => b.rank - a.rank)

  for (const c of candidates) {
    if (pacingCount >= need) break
    const s = out[c.i]
    warnings.push(
      `section "${s.id}": intent "${s.animation.intent}" demoted to fade-up-stagger — pacing requires at least ${need} calm section(s) (R4)`,
    )
    out[c.i] = withIntent(s, 'fade-up-stagger')
    pacingCount++
  }
  return out
}

/**
 * Apply composition rules R1–R7 to an already-clamped blueprint. Never
 * rejects — every violation is auto-corrected in place with a warning.
 */
export function applyCompositionRules(blueprint: PageBlueprint): {
  blueprint: PageBlueprint
  warnings: string[]
} {
  const warnings: string[] = []
  let sections = blueprint.sections.slice()

  // R7 (ordering) — hero first, footer last, if present.
  const heroIdx = sections.findIndex((s) => s.kind === 'hero')
  if (heroIdx > 0) {
    const [hero] = sections.splice(heroIdx, 1)
    sections.unshift(hero)
    warnings.push(`section "${hero.id}": kind "hero" moved to the first position (R7)`)
  }
  const footerIdx = sections.findIndex((s) => s.kind === 'footer')
  if (footerIdx !== -1 && footerIdx !== sections.length - 1) {
    const [footer] = sections.splice(footerIdx, 1)
    sections.push(footer)
    warnings.push(`section "${footer.id}": kind "footer" moved to the last position (R7)`)
  }

  // R2 — hero uses an entrance intent only.
  sections = sections.map((s) => {
    if (s.kind === 'hero' && !ENTRANCE_HERO_INTENTS.has(s.animation.intent)) {
      warnings.push(
        `section "${s.id}" (hero): intent "${s.animation.intent}" is not an entrance intent — demoted to split-text-reveal (R2)`,
      )
      return withIntent(s, 'split-text-reveal')
    }
    return s
  })

  // R3 — footer: none | fade-up-stagger only.
  sections = sections.map((s) => {
    if (
      s.kind === 'footer' &&
      s.animation.intent !== 'none' &&
      s.animation.intent !== 'fade-up-stagger'
    ) {
      warnings.push(
        `section "${s.id}" (footer): intent "${s.animation.intent}" is not allowed on a footer — demoted to none (R3)`,
      )
      return withIntent(s, 'none')
    }
    return s
  })

  // R6 — count-up-stats only allowed on kind "stats".
  sections = sections.map((s) => {
    if (s.animation.intent === 'count-up-stats' && s.kind !== 'stats') {
      warnings.push(
        `section "${s.id}": count-up-stats only allowed on kind "stats" (got "${s.kind}") — demoted to fade-up-stagger (R6)`,
      )
      return withIntent(s, 'fade-up-stagger')
    }
    return s
  })

  // R1 — at most one pin intent; at most two heavy sections total, never adjacent.
  sections = enforceHeavyLimit(sections, warnings)

  // R5 — theme-shift at most twice, never adjacent.
  sections = enforceSpacedLimit(sections, 'theme-shift', 2, 'R5', warnings)

  // R4 — at least ceil(n/3) sections are pacing (none | fade-up-stagger).
  sections = enforcePacing(sections, warnings)

  return { blueprint: { ...blueprint, sections }, warnings }
}

/** Dedupe section ids by suffixing `-2`, `-3`, … (§6, run last). */
export function dedupeSectionIds(blueprint: PageBlueprint): {
  blueprint: PageBlueprint
  warnings: string[]
} {
  const warnings: string[] = []
  const seen = new Map<string, number>()
  const sections = blueprint.sections.map((s) => {
    const count = seen.get(s.id) ?? 0
    seen.set(s.id, count + 1)
    if (count === 0) return s
    const newId = `${s.id}-${count + 1}`
    warnings.push(`duplicate section id "${s.id}" renamed to "${newId}"`)
    return { ...s, id: newId }
  })
  return { blueprint: { ...blueprint, sections }, warnings }
}
