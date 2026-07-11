import type { PageBlueprint } from '../src/lib/schema'
import { runPlanner } from '../src/lib/plan'
import { runCopywriter } from '../src/lib/write-copy'
import type { ChatFn } from '../src/lib/llm'

/* ============================================================================
 * Phase 3 verification (AGENT_SPEC §8, Phase 3 exit criteria), deterministic —
 * NO live API key required. Proves:
 *   1. a clean Planner JSON response parses straight through
 *   2. malformed JSON (prose-wrapped) is repaired
 *   3. an invalid shape (bad enum) is repaired
 *   4. composition rules R1-R7 auto-correct a deliberately-broken blueprint
 *   5. clampParams runs over every section's params (F3)
 *   6. duplicate section ids are deduped
 *   7. a clean Copywriter response parses straight through
 *   8. malformed JSON is repaired
 *   9. missing/extra section ids are reconciled (F4) with stub copy
 *   10. animation-aware headline truncation (split-text-reveal chars/words)
 *   11. a copywriter that fails twice still yields full stub copy for every section
 *   12. an end-to-end run across 10 varied prompts against a scripted "planner"
 *       chat fn never throws and always yields ok:true (or a clean error)
 * ========================================================================== */

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  const tag = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
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

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const goodBlueprintJson = JSON.stringify({
  meta: { title: 'Grid Type — Fonts for Terminal Romantics', description: 'A type foundry for monospace faces with actual personality.' },
  tone: 'dry, precise, a little nerdy; short declarative sentences',
  theme: {
    mode: 'dark',
    colors: { bg: '#0a0a0b', surface: '#141416', text: '#f2f2ef', muted: '#8a8a86', accent: '#c8ff4d', accentContrast: '#0a0a0b' },
    fonts: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
    radius: 4,
  },
  sections: [
    { id: 'hero', kind: 'hero', contentBrief: 'Foundry name and thesis: monospace fonts designed for reading, not just code.', animation: { intent: 'split-text-reveal', params: { unit: 'chars', stagger: 0.03 }, note: 'characters land like keystrokes' } },
    { id: 'specimens', kind: 'showcase', contentBrief: 'Three flagship typefaces shown as large specimens with one-line personalities.', animation: { intent: 'pinned-step-sequence', params: { steps: 3 } } },
    { id: 'features', kind: 'feature-grid', contentBrief: 'Ligatures, powerline glyphs, italics that do not apologize.', animation: { intent: 'fade-up-stagger', params: { distance: 32 } } },
    { id: 'stats', kind: 'stats', contentBrief: 'Adoption numbers: downloads, editors supported, glyph count.', animation: { intent: 'count-up-stats', params: {} } },
    { id: 'cta', kind: 'cta', contentBrief: 'Try every face free for 30 days.', animation: { intent: 'fade-up-stagger', params: {} } },
    { id: 'footer', kind: 'footer', contentBrief: 'Minimal footer: license, contact, colophon.', animation: { intent: 'none', params: {} } },
  ],
})

const proseWrappedGoodJson = `Sure! Here is the plan you asked for:\n\n${goodBlueprintJson}\n\nHope this helps!`

const badEnumJson = goodBlueprintJson.replace('"pinned-step-sequence"', '"zoom-blast"')

/* -------------------------------------------------------------------------- */
console.log('\n1. Clean Planner JSON parses straight through')
await (async () => {
  const res = await runPlanner('a landing page for a monospace font foundry', scriptedChat([goodBlueprintJson]))
  check('ok', res.ok, res.ok ? '' : res.errors.join(' | '))
})()

console.log('\n2. Prose-wrapped JSON is repaired')
await (async () => {
  const res = await runPlanner('a landing page for a monospace font foundry', scriptedChat([proseWrappedGoodJson, goodBlueprintJson]))
  check('repaired to ok', res.ok, res.ok ? '' : res.errors.join(' | '))
})()

console.log('\n3. Invalid enum (bad shape) is repaired')
await (async () => {
  const res = await runPlanner('a landing page for a monospace font foundry', scriptedChat([badEnumJson, goodBlueprintJson]))
  check('repaired to ok', res.ok, res.ok ? '' : res.errors.join(' | '))
})()

console.log('\n3b. Two failures in a row surface an error, never throw')
await (async () => {
  const res = await runPlanner('a landing page for a monospace font foundry', scriptedChat([badEnumJson, badEnumJson]))
  check('ok:false with errors', !res.ok && res.errors.length > 0)
})()

console.log('\n3c. A total call failure surfaces an error, never throws')
await (async () => {
  const res = await runPlanner('a landing page for a monospace font foundry', throwingChat)
  check('ok:false with errors', !res.ok && res.errors.length > 0)
})()

/* -------------------------------------------------------------------------- */
/* 4-6. composition rules + clamp + dedupe on a deliberately-broken blueprint  */
/* -------------------------------------------------------------------------- */
console.log('\n4-6. Composition rules auto-correct a deliberately-broken blueprint')
const brokenBlueprintJson = JSON.stringify({
  meta: { title: 'Overloaded Demo', description: 'A page that violates every composition rule at once.' },
  tone: 'loud, chaotic',
  theme: {
    mode: 'dark',
    colors: { bg: '#0a0a0b', surface: '#141416', text: '#f2f2ef', muted: '#8a8a86', accent: '#c8ff4d', accentContrast: '#0a0a0b' },
    fonts: { display: 'Sora', body: 'Inter' },
    radius: 8,
  },
  sections: [
    // hero uses a non-entrance intent (R2 violation) and is NOT first (R7)
    { id: 'stats', kind: 'stats', contentBrief: 'Adoption numbers and traction metrics for the product.', animation: { intent: 'count-up-stats', params: {} } },
    { id: 'hero', kind: 'hero', contentBrief: 'Big bold hero statement about the product thesis.', animation: { intent: 'marquee-loop', params: {} } },
    // two pinned intents (R1) adjacent
    { id: 'step-one', kind: 'process', contentBrief: 'First pinned walkthrough of the product steps.', animation: { intent: 'pinned-step-sequence', params: { steps: 5000 } } },
    { id: 'step-two', kind: 'showcase', contentBrief: 'Second pinned walkthrough that should be demoted.', animation: { intent: 'horizontal-scroll-track', params: {} } },
    // count-up-stats on a non-stats kind (R6)
    { id: 'features', kind: 'feature-grid', contentBrief: 'Feature list with a miscount of count-up-stats intent.', animation: { intent: 'count-up-stats', params: {} } },
    // two adjacent theme-shifts (R5) — the second must be demoted
    { id: 'shift-one', kind: 'testimonial', contentBrief: 'A themed testimonial section with a background shift.', animation: { intent: 'theme-shift', params: {} } },
    { id: 'shift-two', kind: 'pricing', contentBrief: 'A themed pricing section with a background shift.', animation: { intent: 'theme-shift', params: {} } },
    // footer uses a disallowed intent (R3) and is duplicated id with hero-adjacent "hero"
    { id: 'hero', kind: 'footer', contentBrief: 'Footer with a disallowed scale-settle intent.', animation: { intent: 'scale-settle', params: {} } },
  ],
})

await (async () => {
  const res = await runPlanner('an intentionally overloaded demo page', scriptedChat([brokenBlueprintJson]))
  check('ok', res.ok, res.ok ? '' : res.errors.join(' | '))
  if (!res.ok) {
    console.log(`${failures} check(s) failed so far — aborting composition assertions`)
  } else {
    const bp: PageBlueprint = res.blueprint
    check('hero is first', bp.sections[0].kind === 'hero', bp.sections.map((s) => s.kind).join(','))
    check('footer is last', bp.sections[bp.sections.length - 1].kind === 'footer')
    check(
      'hero uses an entrance intent (R2)',
      ['fade-up-stagger', 'split-text-reveal', 'mask-wipe', 'scale-settle'].includes(bp.sections[0].animation.intent),
      bp.sections[0].animation.intent,
    )
    const footer = bp.sections[bp.sections.length - 1]
    check(
      'footer uses none|fade-up-stagger (R3)',
      footer.animation.intent === 'none' || footer.animation.intent === 'fade-up-stagger',
      footer.animation.intent,
    )
    const pinCount = bp.sections.filter((s) => s.animation.intent === 'pinned-step-sequence' || s.animation.intent === 'horizontal-scroll-track').length
    check('at most one pinned intent survives (R1)', pinCount <= 1, `${pinCount} pinned sections`)
    const statsIntentOnWrongKind = bp.sections.some((s) => s.animation.intent === 'count-up-stats' && s.kind !== 'stats')
    check('count-up-stats only on kind stats (R6)', !statsIntentOnWrongKind)
    let themeShiftCount = 0
    let adjacentThemeShift = false
    let prevWasThemeShift = false
    for (const s of bp.sections) {
      const isShift = s.animation.intent === 'theme-shift'
      if (isShift) {
        themeShiftCount++
        if (prevWasThemeShift) adjacentThemeShift = true
      }
      prevWasThemeShift = isShift
    }
    check('theme-shift at most twice (R5)', themeShiftCount <= 2, `${themeShiftCount} theme-shift sections`)
    check('theme-shift never adjacent (R5)', !adjacentThemeShift)
    const pacingCount = bp.sections.filter((s) => s.animation.intent === 'none' || s.animation.intent === 'fade-up-stagger').length
    check('pacing floor met (R4)', pacingCount >= Math.ceil(bp.sections.length / 3), `${pacingCount}/${bp.sections.length}`)
    const ids = bp.sections.map((s) => s.id)
    check('all ids unique after dedupe', new Set(ids).size === ids.length, ids.join(','))
    check('duplicate "hero" id renamed', ids.includes('hero-2') || ids.filter((id) => id === 'hero').length === 1)
    const stepTwo = bp.sections.find((s) => s.contentBrief.includes('Second pinned walkthrough'))
    check(
      'clampParams ran: absurd steps=5000 was clamped',
      bp.sections.every((s) => typeof s.animation.params.steps !== 'number' || (s.animation.params.steps as number) <= 4),
    )
    void stepTwo
  }
})()

/* -------------------------------------------------------------------------- */
/* 7-11. Copywriter                                                            */
/* -------------------------------------------------------------------------- */
console.log('\n7. Clean Copywriter JSON parses straight through')

function copyJsonFor(sectionIds: string[]): string {
  return JSON.stringify({
    sections: sectionIds.map((id) => ({ id, headline: `Headline for ${id} goes here now` })),
  })
}

const goodPlanRes = await runPlanner('a landing page for a monospace font foundry', scriptedChat([goodBlueprintJson]))
if (!goodPlanRes.ok) throw new Error('setup failed: planner fixture did not parse')
const blueprint = goodPlanRes.blueprint
const sectionIds = blueprint.sections.map((s) => s.id)

await (async () => {
  const copyRaw = copyJsonFor(sectionIds)
  const res = await runCopywriter('a landing page for a monospace font foundry', blueprint, scriptedChat([copyRaw]))
  check('ok', res.ok)
  check('same ids in order', res.copy.sections.map((c) => c.id).join(',') === sectionIds.join(','))
})()

console.log('\n8. Malformed Copywriter JSON is repaired')
await (async () => {
  const goodCopy = copyJsonFor(sectionIds)
  const broken = 'not json at all, sorry'
  const res = await runCopywriter('a landing page for a monospace font foundry', blueprint, scriptedChat([broken, goodCopy]))
  check('ok', res.ok)
  check('no reconciliation warnings needed', !res.warnings.some((w) => w.includes('stub copy')), res.warnings.join(' | '))
})()

console.log('\n9. Missing/extra section ids are reconciled (F4)')
await (async () => {
  // Drop the last section id, add a bogus extra one.
  const idsWithGap = [...sectionIds.slice(0, -1), 'bogus-extra-section']
  const copyRaw = copyJsonFor(idsWithGap)
  const res = await runCopywriter('a landing page for a monospace font foundry', blueprint, scriptedChat([copyRaw]))
  check('ok', res.ok)
  check('output has exactly the blueprint ids, in order', res.copy.sections.map((c) => c.id).join(',') === sectionIds.join(','))
  const missingId = sectionIds[sectionIds.length - 1]
  check(
    `missing "${missingId}" got stub copy`,
    res.warnings.some((w) => w.includes(`section "${missingId}"`) && w.includes('stub copy')),
  )
  check(
    'extra id dropped and warned',
    res.warnings.some((w) => w.includes('bogus-extra-section')),
  )
})()

console.log('\n10. Animation-aware headline truncation')
await (async () => {
  const heroId = blueprint.sections[0].id // hero uses split-text-reveal unit=chars → <=4 words
  const overLong = { sections: [{ id: heroId, headline: 'This headline has way too many words in it for chars mode' }, ...sectionIds.slice(1).map((id) => ({ id, headline: `Headline for ${id} goes here now` }))] }
  const res = await runCopywriter('a landing page for a monospace font foundry', blueprint, scriptedChat([JSON.stringify(overLong)]))
  check('ok', res.ok)
  const heroCopy = res.copy.sections.find((c) => c.id === heroId)
  check('hero headline truncated to <=4 words', Boolean(heroCopy && heroCopy.headline.split(/\s+/).length <= 4), heroCopy?.headline)
  check('truncation warning surfaced', res.warnings.some((w) => w.includes('headline truncated')))
})()

console.log('\n11. Copywriter double-failure still yields full stub copy')
await (async () => {
  const res = await runCopywriter('a landing page for a monospace font foundry', blueprint, scriptedChat(['not json', 'still not json']))
  check('ok', res.ok)
  check('every section has a headline', res.copy.sections.every((c) => c.headline.length > 0))
  check('same ids as blueprint, in order', res.copy.sections.map((c) => c.id).join(',') === sectionIds.join(','))
  check('stub-copy warning surfaced', res.warnings.some((w) => w.includes('stub copy for every section')))
})()

/* -------------------------------------------------------------------------- */
/* 12. End-to-end across 10 varied prompts, scripted planner + copywriter     */
/* -------------------------------------------------------------------------- */
console.log('\n12. Ten varied prompts → valid Blueprint + CopyDoc, zero unhandled rejections')
const briefs = [
  'a landing page for a monospace font foundry',
  'a SaaS analytics dashboard for e-commerce founders',
  'a boutique coffee subscription service',
  'an open-source database migration tool',
  'a fintech app for freelancer invoicing',
  'a climbing gym membership signup page',
  'an AI-powered resume builder',
  'a sustainable sneaker brand',
  'a remote-first hiring platform',
  'a synthesizer plugin for electronic musicians',
]

for (const brief of briefs) {
  try {
    const planRes = await runPlanner(brief, scriptedChat([goodBlueprintJson]))
    check(`[${brief}] planner ok`, planRes.ok)
    if (!planRes.ok) continue
    const ids = planRes.blueprint.sections.map((s) => s.id)
    const copyRes = await runCopywriter(brief, planRes.blueprint, scriptedChat([copyJsonFor(ids)]))
    check(`[${brief}] copywriter ok`, copyRes.ok)
  } catch (e) {
    check(`[${brief}] no unhandled rejection`, false, String(e))
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
