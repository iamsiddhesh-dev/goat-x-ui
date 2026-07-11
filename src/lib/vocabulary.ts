import type { AnimationIntentId, AnimationSpec, SectionCopy, SectionModule, ThemeTokens, SectionKind } from './schema'

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
 * Phase 2 fully implements 6 intents (none, fade-up-stagger, split-text-reveal,
 * parallax-drift, pinned-step-sequence, marquee-loop). The remaining 8 have
 * param specs (so clampParams is TOTAL over all 14) and degrade to a generic
 * entrance card + skeleton until Phase 5 finishes their cards/skeletons.
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
