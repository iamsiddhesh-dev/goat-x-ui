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
 * All 14 intents have param specs (clampParams is TOTAL over all 14) and a
 * dedicated contract card + fallback skeleton (skeletons/). GENERIC_CARD below
 * remains as a defensive fallback only — it should never be reached.
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

/** A JS expression resolving a theme-shift `bg` param to a concrete color at runtime. */
export function themeShiftTargetExpr(bg: string): string {
  if (bg === 'accent' || bg === 'surface') {
    return `getComputedStyle(root).getPropertyValue('--${bg}').trim()`
  }
  return `'${bg}'` // already-validated hex
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

  'scrub-choreography': (p) => `## INTENT: scrub-choreography
A free-form timeline of transform/opacity tweens scrubbed across the section's viewport transit. The most open intent — invent the choreography.
Clamped params: smoothing=${p.smoothing} (the ScrollTrigger \`scrub\` value).

MECHANICS YOU MUST KEEP:
- ONE gsap.timeline() with ONE ScrollTrigger driving the whole section:
    scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: ${p.smoothing} }.
- Every tween on the timeline uses ease: 'none' (scrub already supplies the
  easing via scroll position) and animates transform/opacity/clipPath ONLY —
  never width/height/top/left/margin/padding/fontSize (rule C2).
- Never pin — this intent scrubs, it does not pin (that's pinned-step-sequence's
  job). At least two elements should move on the timeline, or it reads as a
  weaker parallax-drift.

YOURS TO INVENT:
- The entire choreography: what moves, in what order, whether elements
  counter-move, rotate, or scale against each other. This is the one intent
  with no fixed shape beyond "one scrubbed timeline, transform/opacity only."

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var media = root.querySelector('.media');
var copy = root.querySelector('.copy');
var tl = gsap.timeline({
  scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: ${p.smoothing} }
});
tl.to(media, { yPercent: -20, rotate: 6, ease: 'none' }, 0)
  .to(copy, { yPercent: 12, ease: 'none' }, 0);
\`\`\``,

  'horizontal-scroll-track': (p) => `## INTENT: horizontal-scroll-track
Section pins to the viewport; an inner track of ${p.panels} panels translates horizontally as the user scrolls vertically.
Clamped params: panels=${p.panels} (scrub fixed at 1).

MECHANICS YOU MUST KEEP (load-bearing ScrollTrigger shape):
- ONE ScrollTrigger: { trigger: root, pin: root, scrub: 1, anticipatePin: 1,
  start: 'top top', end: '+=' + (${p.panels} * 100) + '%' }.
- The track is a flex row of exactly ${p.panels} full-width panels. The
  horizontal layout must be opted into from JS (add a class to the track in
  JS), so with JS off the panels flow as a readable vertical list.
- ONE tween drives the whole track: gsap.to(track, { xPercent: -(100 * (${p.panels} - 1) / ${p.panels}),
  ease: 'none', scrollTrigger: {...} }) — the track is ${p.panels}x root width, so
  the xPercent (relative to the TRACK's own width) must be scaled by panel count,
  not a flat -100 per panel. xPercent only — never left/width.

YOURS TO INVENT (do not copy the reference layout):
- What a "panel" is for THIS content, panel styling, any progress indicator
  (dots, counter) — as long as it doesn't add a second ScrollTrigger or pin.

REFERENCE SKELETON — mechanics example ONLY, copying its DOM/layout is a failure:
\`\`\`js
var track = root.querySelector('.track');
track.classList.add('is-animated');
gsap.to(track, {
  xPercent: -(100 * (${p.panels} - 1) / ${p.panels}), ease: 'none',
  scrollTrigger: { trigger: root, pin: root, scrub: 1, anticipatePin: 1,
    start: 'top top', end: '+=' + (${p.panels} * 100) + '%' }
});
\`\`\``,

  'theme-shift': (p) => `## INTENT: theme-shift
This section's own background crossfades to a different theme color while it is in view, and reverses when the user scrolls back up past it (a toggle, not a one-shot reveal).
Clamped params: bg=${p.bg}.

MECHANICS YOU MUST KEEP:
- The section (root) itself must be visually full-bleed (e.g. min-height:
  100vh) so the crossfade reads as a page-background shift, not a small patch.
- Resolve the target color at runtime — never hardcode a literal unless bg is
  already a hex — via: ${themeShiftTargetExpr(String(p.bg))}.
- ONE gsap.to on root's backgroundColor, with toggleActions so it plays
  forward on enter, STAYS shifted while scrolling on past it, and only
  REVERSES specifically on leave-back — scrolling back up past the top edge
  (this is the one exception to "once: true" — theme-shift must be
  reversible, but only in that one direction):
    gsap.to(root, { backgroundColor: target, duration: 0.6, ease: 'power2.inOut',
      scrollTrigger: { trigger: root, start: 'top center', end: 'bottom center',
        toggleActions: 'play none none reverse' } }).
- backgroundColor is the ONLY non-transform/opacity property this intent may
  animate (rule C2's explicit theme-shift exception). Never top/left/width/height.

YOURS TO INVENT:
- The section's own content/layout on top of the shifting background. Ensure
  text stays legible against both the start and end background colors.

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var target = ${themeShiftTargetExpr(String(p.bg))};
gsap.to(root, {
  backgroundColor: target, duration: 0.6, ease: 'power2.inOut',
  scrollTrigger: { trigger: root, start: 'top center', end: 'bottom center',
    toggleActions: 'play none none reverse' }
});
\`\`\``,

  'count-up-stats': (p) => `## INTENT: count-up-stats
Numbers count up from 0 to their target value, with snap-to-integer rounding, when the section enters. Only valid on a "stats" kind section.
Clamped params: duration=${p.duration}s.

MECHANICS YOU MUST KEEP:
- Read stats from the copy's \`stats\` array ({value, label} — NOT \`items\`).
  Each stat number lives in its own element (class 'stat-num'), with its
  \`value\` string parsed into a { prefix, value, suffix } shape (e.g. "$4.2M"
  → prefix "$", value 4.2, suffix "M"; "250+" → prefix "", value 250, suffix "+").
- Use a plain proxy object PER stat, never tween the DOM element's text
  directly: var proxy = { val: 0 }; then
    gsap.to(proxy, { val: value, duration: ${p.duration}, ease: 'power1.out',
      snap: { val: 1 }, onUpdate: function () { el.textContent = prefix + Math.round(proxy.val) + suffix; } }).
- ONE ScrollTrigger with once: true driving all stats together, guarded exactly
  like fade-up-stagger (a stats row can already be on-screen at load):
    var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
    if (st.isActive) { st.kill(); play(); }
- Numbers start already visible at "0" (or "prefix+0+suffix") — no CSS-hidden
  initial state is needed for this intent (rule C9 doesn't apply; there is
  nothing to hide).

YOURS TO INVENT:
- Stat layout/grid, labels beneath each number, decimal precision if the
  parsed value is non-integer (round only for display, keep proxy precise).

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var nums = gsap.utils.toArray(root.querySelectorAll('.stat-num'));
function play() {
  nums.forEach(function (el) {
    var value = Number(el.dataset.value);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var proxy = { val: 0 };
    gsap.to(proxy, {
      val: value, duration: ${p.duration}, ease: 'power1.out', snap: { val: 1 },
      onUpdate: function () { el.textContent = prefix + Math.round(proxy.val) + suffix; }
    });
  });
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
\`\`\``,

  'sticky-card-stack': (p) => `## INTENT: sticky-card-stack
${p.cards} cards stack via native CSS position:sticky (NOT a GSAP pin); each incoming card pushes the previous one back with a scale/fade.
Clamped params: cards=${p.cards}.

MECHANICS YOU MUST KEEP:
- Each card lives in its own tall wrapper (e.g. class 'card-wrap', min-height:
  100vh) so scrolling through the section gives each card a runway. The card
  itself is 'position: sticky; top: <some %>' — this is the ONLY intent allowed
  to use position:sticky (rule C7 exception).
- NEVER use a GSAP pin (\`pin:\`) here — sticky positioning does the pinning
  natively. Using pin would violate rule C4 for this intent.
- For each card except the last, ONE scrubbed ScrollTrigger keyed to the NEXT
  card's wrapper entering, scaling/fading the current card back:
    gsap.to(cards[i], { scale: 0.9, autoAlpha: 0.6, ease: 'none',
      scrollTrigger: { trigger: wraps[i+1], start: 'top bottom', end: 'top top', scrub: true } }).
  transform (scale) + opacity only.

YOURS TO INVENT:
- Card content/styling, the exact scale-back amount, sticky top offset, any
  index/counter UI. Content must be readable with JS off (cards just stack in
  normal document flow, sticky alone still reads fine).

REFERENCE SKELETON — mechanics example ONLY, do not copy the DOM/layout:
\`\`\`js
var wraps = gsap.utils.toArray(root.querySelectorAll('.card-wrap'));
var cards = wraps.map(function (w) { return w.querySelector('.card'); });
cards.forEach(function (card, i) {
  if (i === cards.length - 1) return;
  gsap.to(card, {
    scale: 0.9, autoAlpha: 0.6, ease: 'none',
    scrollTrigger: { trigger: wraps[i + 1], start: 'top bottom', end: 'top top', scrub: true }
  });
});
\`\`\``,

  'reverse-parallax': (p) => `## INTENT: reverse-parallax
Media drifts AGAINST the direction parallax-drift would use, while the text flows normally (no scroll-linked transform on text at all).
Clamped params: intensity=${p.intensity}.

MECHANICS YOU MUST KEEP:
- Exactly ONE media/decorative element drifts (a class like '.media'). The text
  block gets NO scrollTrigger, no transform — it must sit in plain normal flow.
- ONE ScrollTrigger, ALWAYS scrubbed (ease 'none'):
    { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true }.
- Drift is a yPercent tween only, POSITIVE (downward as the page scrolls down —
  this is what makes it "reverse" of parallax-drift's upward drift):
    gsap.to(media, { yPercent: +N, ease: 'none', scrollTrigger: {...} }).
  Intensity '${p.intensity}' ≈ drift ${p.intensity === 'subtle' ? 8 : p.intensity === 'strong' ? 24 : 15}%.
- Never pin. Never animate anything but yPercent/y (+ optional opacity) on the
  media element.

YOURS TO INVENT:
- What the media element IS (image placeholder, gradient panel, decorative
  shape) and its stacking relative to the static text. Content must be readable
  with JS off (no layer starts offset in CSS).

REFERENCE SKELETON — mechanics example ONLY:
\`\`\`js
var media = root.querySelector('.media');
gsap.to(media, { yPercent: ${p.intensity === 'subtle' ? 8 : p.intensity === 'strong' ? 24 : 15}, ease: 'none',
  scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });
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

/** All 14 intents now ship a dedicated contract card + skeleton. */
export const IMPLEMENTED_INTENTS: ReadonlySet<AnimationIntentId> = new Set([
  'none',
  'fade-up-stagger',
  'split-text-reveal',
  'mask-wipe',
  'scale-settle',
  'parallax-drift',
  'reverse-parallax',
  'scrub-choreography',
  'horizontal-scroll-track',
  'sticky-card-stack',
  'count-up-stats',
  'theme-shift',
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
