import { readFileSync } from 'node:fs'
import { runPlanner } from '../src/lib/plan'
import { runCopywriter } from '../src/lib/write-copy'
import { runSectionCodegen } from '../src/lib/codegen'
import { chat } from '../src/lib/gemini'

/* ============================================================================
 * Live prompt-quality pass (AGENT_SPEC §8 Phase 5) — hits the REAL Gemini API.
 *
 * Runs the full pipeline (plan -> copy -> per-section codegen) for a handful
 * of varied briefs and reports, per stage: warnings, and per-section origin
 * (generated / repaired / fallback) with the validator errors that triggered
 * any repair or fallback. This is diagnostic-only — it does not assert pass/
 * fail; the output is read by hand to decide what to tune in prompts.ts.
 * ========================================================================== */

// tsx does not auto-load .env; parse it manually so GEMINI_API_KEY is set.
try {
  const envFile = readFileSync('.env', 'utf-8')
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
} catch {
  // no .env — assume the env var is already set
}

const briefs = [
  'a boutique coffee subscription service',
  'a fintech app for freelancer invoicing',
  'a synthesizer plugin for electronic musicians',
]

async function runOne(brief: string) {
  console.log(`\n${'='.repeat(70)}\nBRIEF: ${brief}\n${'='.repeat(70)}`)

  const planRes = await runPlanner(brief, chat)
  if (!planRes.ok) {
    console.log(`  [PLANNER FAILED] ${planRes.errors.join(' | ')}`)
    return
  }
  console.log(`  [planner ok] ${planRes.blueprint.sections.length} sections: ${planRes.blueprint.sections.map((s) => `${s.id}(${s.animation.intent})`).join(', ')}`)
  if (planRes.warnings.length) console.log(`  [planner warnings] ${planRes.warnings.join(' | ')}`)

  const copyRes = await runCopywriter(brief, planRes.blueprint, chat)
  console.log(`  [copywriter ok]`)
  if (copyRes.warnings.length) console.log(`  [copywriter warnings] ${copyRes.warnings.join(' | ')}`)

  const copyById = new Map(copyRes.copy.sections.map((c) => [c.id, c]))
  const sections = planRes.blueprint.sections

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const copy = copyById.get(section.id)!
    const result = await runSectionCodegen(
      {
        tone: planRes.blueprint.tone,
        theme: planRes.blueprint.theme,
        section,
        copy,
        prevKind: sections[i - 1]?.kind,
        nextKind: sections[i + 1]?.kind,
      },
      chat,
    )
    const tag = result.module.origin.toUpperCase()
    console.log(`  [section "${section.id}" (${section.animation.intent})] origin=${tag}`)
    if (result.warnings.length) console.log(`    warnings: ${result.warnings.join(' | ')}`)
  }
}

for (const brief of briefs) {
  await runOne(brief)
}
