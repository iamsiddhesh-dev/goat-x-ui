import { writeFileSync, mkdirSync } from 'node:fs'
import type { AnimationIntentId, SectionCopy, SectionPlan, ThemeTokens } from '../src/lib/schema'
import { clampParams } from '../src/lib/vocabulary'
import { skeletonFor } from '../src/lib/skeletons'
import { extractBlocks, validateModule, validateParts } from '../src/lib/validate'
import { runSectionCodegen, type GenerateSectionInput } from '../src/lib/codegen'
import type { ChatFn } from '../src/lib/llm'
import { assemble } from '../src/lib/assemble'

/* ============================================================================
 * Phase 2 verification (AGENT_SPEC §8, Phase 2 exit criteria), deterministic —
 * NO live API key. Proves:
 *   1. every fallback skeleton passes the validator (lint-clean by construction)
 *   2. a good codegen output validates → module (origin 'generated')
 *   3. a lint-violating output is caught with SPECIFIC errors → repair → pass
 *   4. a double failure lands on the fallback skeleton (origin 'fallback')
 *   5. an LLM call error lands on the fallback skeleton
 *   6. clampParams clamps out-of-range params + drops unknowns (+warnings)
 * It also emits an offline, vendored preview (public/phase2-preview.html) of
 * generated + skeleton sections in the Phase-1 harness for a manual browser pass.
 * ========================================================================== */

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const theme: ThemeTokens = {
  mode: 'dark',
  colors: {
    bg: '#0a0a0b',
    surface: '#141416',
    text: '#f2f2ef',
    muted: '#8a8a86',
    accent: '#c8ff4d',
    accentContrast: '#0a0a0b',
  },
  fonts: { display: 'Space Grotesk', body: 'Inter' },
  radius: 6,
}

/* Sample copy rich enough to drive every skeleton (items, sub, cta). */
function sampleCopy(id: string): SectionCopy {
  return {
    id,
    eyebrow: 'Phase 2 · codegen',
    headline: 'Real animation code, written per request',
    subheadline:
      'The vocabulary fences off the five things a 70B model gets wrong; everything else is free.',
    body: 'Closed intents, clamped params, a lint gate, and a deterministic fallback for every section.',
    items: [
      { title: 'Closed intent set', body: 'Fourteen known-good ScrollTrigger patterns.' },
      { title: 'Clamped params', body: 'Out-of-range values are corrected, never rejected.' },
      { title: 'Fallback skeleton', body: 'A known-good module lands every failed section.' },
    ],
    cta: { label: 'Generate a page', sub: 'No credit card required' },
  }
}

function planFor(id: string, kind: SectionPlan['kind'], intent: AnimationIntentId): SectionPlan {
  return {
    id,
    kind,
    contentBrief: 'Verification fixture section for phase 2.',
    animation: { intent, params: {} },
  }
}

/* -------------------------------------------------------------------------- */
/* 1. every fallback skeleton is lint-clean                                   */
/* -------------------------------------------------------------------------- */
console.log('\n1. Fallback skeletons pass the validator')
const skeletonIntents: AnimationIntentId[] = [
  'none',
  'fade-up-stagger',
  'split-text-reveal',
  'parallax-drift',
  'pinned-step-sequence',
  'marquee-loop',
]
for (const intent of skeletonIntents) {
  const id = intent === 'marquee-loop' ? 'logos' : 'demo'
  const { params } = clampParams({ intent, params: {} })
  const mod = skeletonFor(intent)({ id, kind: 'feature-grid', copy: sampleCopy(id), theme, params })
  const errs = validateParts({ html: mod.html, css: mod.css, js: mod.js }, { id, intent })
  check(`skeleton "${intent}" lint-clean`, errs.length === 0, errs.join(' | '))
  check(`skeleton "${intent}" origin=fallback`, mod.origin === 'fallback')
}

/* -------------------------------------------------------------------------- */
/* raw codegen fixtures                                                        */
/* -------------------------------------------------------------------------- */

// A clean, contract-abiding fade-up section (as the LLM would emit it).
const goodRaw = `===HTML===
<section data-section="feature" class="s-feature">
  <div class="container inner">
    <p class="eyebrow reveal">Phase 2</p>
    <h2 class="reveal">Real animation code, written per request</h2>
    <p class="sub reveal">Closed intents, clamped params, a lint gate.</p>
  </div>
</section>
===CSS===
.inner{display:flex;flex-direction:column;gap:1rem;max-width:820px}
.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em}
h2{font-size:clamp(2rem,5vw,3.5rem)}
.sub{color:var(--muted)}
===JS===
var els = root.querySelectorAll('.reveal');
gsap.set(els, { y: 40, autoAlpha: 0 });
function play(){ gsap.to(els, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.1, ease: 'power3.out' }); }
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }
===END===`

// Same shape but with two hard violations: a forbidden token and a banned ease.
const brokenRaw = `===HTML===
<section data-section="feature" class="s-feature">
  <div class="container inner"><h2 class="reveal">Broken on purpose</h2></div>
</section>
===CSS===
.inner{display:flex}
===JS===
var els = document.querySelectorAll('.reveal');
gsap.from(els, { y: 40, autoAlpha: 0, ease: 'bounce.out' });
===END===`

/* -------------------------------------------------------------------------- */
/* 2. good output validates                                                    */
/* -------------------------------------------------------------------------- */
console.log('\n2. A clean codegen output validates')
{
  const res = validateModule(goodRaw, { id: 'feature', intent: 'fade-up-stagger' })
  check('goodRaw ok', res.ok, res.errors.join(' | '))
  check('goodRaw css auto-prefixed', Boolean(res.module && res.module.css.includes('.s-feature .inner')))
}

/* -------------------------------------------------------------------------- */
/* 3. lint catches specific violations; bad delimiters caught                  */
/* -------------------------------------------------------------------------- */
console.log('\n3. Lint catches violations with specific errors')
{
  const res = validateModule(brokenRaw, { id: 'feature', intent: 'fade-up-stagger' })
  check('brokenRaw rejected', !res.ok)
  check(
    'reports forbidden `document.`',
    res.errors.some((e) => e.includes('document.')),
    res.errors.join(' | '),
  )
  check(
    'reports banned ease `bounce.out`',
    res.errors.some((e) => e.toLowerCase().includes('bounce.out')),
  )
  const noDelim = extractBlocks('here is your section, hope you like it!')
  check('missing delimiters caught', !noDelim.ok)
}

/* -------------------------------------------------------------------------- */
/* mock ChatFn scenarios for runSectionCodegen                                 */
/* -------------------------------------------------------------------------- */
const input: GenerateSectionInput = {
  tone: 'confident, technical, quietly premium; short sentences',
  theme,
  section: planFor('feature', 'feature-grid', 'fade-up-stagger'),
  copy: sampleCopy('feature'),
  prevKind: 'hero',
  nextKind: 'cta',
}

function scriptedChat(responses: string[]): ChatFn {
  let i = 0
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return r
  }
}
const throwingChat: ChatFn = async () => {
  throw new Error('429 rate limit (simulated)')
}

console.log('\n4. runSectionCodegen: generate / repair / fallback paths')
await (async () => {
  const gen = await runSectionCodegen(input, scriptedChat([goodRaw]))
  check('valid first try → origin generated', gen.module.origin === 'generated', gen.warnings.join(' | '))

  const rep = await runSectionCodegen(input, scriptedChat([brokenRaw, goodRaw]))
  check('broken then valid → origin repaired', rep.module.origin === 'repaired')
  check('repair warning surfaced', rep.warnings.some((w) => w.includes('repaired')))

  const fb = await runSectionCodegen(input, scriptedChat([brokenRaw, brokenRaw]))
  check('broken twice → origin fallback', fb.module.origin === 'fallback')
  check('fallback warning surfaced', fb.warnings.some((w) => w.includes('fallback skeleton')))
  const fbErrs = validateParts({ html: fb.module.html, css: fb.module.css, js: fb.module.js }, { id: 'feature', intent: 'fade-up-stagger' })
  check('fallback module is itself lint-clean', fbErrs.length === 0, fbErrs.join(' | '))

  const err = await runSectionCodegen(input, throwingChat)
  check('LLM call error → origin fallback', err.module.origin === 'fallback')
})()

/* -------------------------------------------------------------------------- */
/* 6. clampParams                                                              */
/* -------------------------------------------------------------------------- */
console.log('\n6. clampParams clamps + drops unknowns')
{
  const { params, warnings } = clampParams({
    intent: 'fade-up-stagger',
    params: { stagger: 0.9, distance: 5, bogus: 'x' },
  })
  check('stagger 0.9 clamped to 0.15', params.stagger === 0.15)
  check('distance 5 clamped to 24', params.distance === 24)
  check('unknown `bogus` dropped', !('bogus' in params))
  check('three warnings emitted', warnings.length === 3, warnings.join(' | '))

  const enumClamp = clampParams({ intent: 'marquee-loop', params: { direction: 'sideways' } })
  check('invalid enum → default "left"', enumClamp.params.direction === 'left')
}

/* -------------------------------------------------------------------------- */
/* emit offline preview for the browser pane                                   */
/* -------------------------------------------------------------------------- */
console.log('\nEmitting offline preview (public/phase2-preview.html)')
{
  // Hero: a "generated" module built from goodRaw (as the pipeline would).
  const heroPlan = planFor('feature', 'hero', 'fade-up-stagger')
  const heroGen = validateModule(goodRaw, { id: 'feature', intent: 'fade-up-stagger' })
  const heroMod = heroGen.module!

  // Plus three fallback skeletons to exercise split / pinned / marquee visually.
  const splitMod = skeletonFor('split-text-reveal')({
    id: 'intro', kind: 'showcase', copy: sampleCopy('intro'),
    theme, params: clampParams({ intent: 'split-text-reveal', params: {} }).params,
  })
  const pinnedMod = skeletonFor('pinned-step-sequence')({
    id: 'steps', kind: 'process', copy: sampleCopy('steps'),
    theme, params: clampParams({ intent: 'pinned-step-sequence', params: {} }).params,
  })
  const marqueeMod = skeletonFor('marquee-loop')({
    id: 'logos', kind: 'logos',
    copy: { id: 'logos', headline: 'Trusted by builders',
      items: [{ title: 'Northwind' }, { title: 'Acme' }, { title: 'Globex' }, { title: 'Initech' }, { title: 'Umbrella' }] },
    theme, params: clampParams({ intent: 'marquee-loop', params: {} }).params,
  })

  const html = assemble({
    meta: { title: 'GOAT-X-UI — Phase 2 codegen', description: 'Generated + skeleton sections.' },
    theme,
    sections: [heroMod, splitMod, pinnedMod, marqueeMod],
  })
  const offline = html
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@3\.13\.0\/dist\//g, '/vendor/')
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/lenis@1\.3\.4\/dist\//g, '/vendor/')
  mkdirSync('public', { recursive: true })
  writeFileSync('public/phase2-preview.html', offline)
  console.log('  wrote public/phase2-preview.html', offline.length, 'bytes')
  void heroPlan
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
