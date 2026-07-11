import type { ChatFn } from './llm'
import { CopyDoc, type PageBlueprint, type SectionCopy, type SectionPlan } from './schema'
import { buildCopywriterPrompt, buildRepairPrompt } from './prompts'
import { parseAndValidateJson } from './llm-json'

/* ============================================================================
 * Copywriter orchestration (AGENT_SPEC §1.1 stage 2, §6, §8 Phase 3).
 *
 * Pure and LLM-agnostic: the ChatFn is injected so parse → repair →
 * reconcile → truncate is exercised by tests with a mock.
 *
 * Doctrine (§6): parse (F1) → Zod (F2) → 1 repair call on failure → if BOTH
 * attempts still fail, treat as zero returned sections (never a 2nd repair —
 * reconciliation below is cheaper and total) → reconcile by id against the
 * blueprint (F4): extras dropped, missing sections get deterministic stub
 * copy from contentBrief, order forced to blueprint order → animation-aware
 * headline truncation. The Copywriter therefore NEVER hard-fails the page.
 * ========================================================================== */

export interface CopywriterResult {
  ok: true
  copy: CopyDoc
  warnings: string[]
}

const COPY_TEMPERATURE = 0.85
const COPY_MAX_TOKENS = 2000
const REPAIR_TEMPERATURE = 0.2

export async function runCopywriter(
  userPrompt: string,
  blueprint: PageBlueprint,
  chatFn: ChatFn,
): Promise<CopywriterResult> {
  const prompt = buildCopywriterPrompt({ userPrompt, blueprint })
  const warnings: string[] = []

  let raw = ''
  try {
    raw = await chatFn({
      system: prompt.system,
      user: prompt.user,
      temperature: COPY_TEMPERATURE,
      maxTokens: COPY_MAX_TOKENS,
      json: true,
    })
  } catch (e) {
    warnings.push(`copywriter call failed: ${errMsg(e)}`)
  }

  let gate = parseAndValidateJson(raw, CopyDoc)

  if (!gate.ok) {
    try {
      const repair = buildRepairPrompt({
        originalUser: prompt.user,
        previousRaw: raw,
        errors: gate.errors,
      })
      const repairRaw = await chatFn({
        system: repair.system,
        user: repair.user,
        temperature: REPAIR_TEMPERATURE,
        maxTokens: COPY_MAX_TOKENS,
        json: true,
      })
      gate = parseAndValidateJson(repairRaw, CopyDoc)
    } catch (e) {
      warnings.push(`copywriter repair call failed: ${errMsg(e)}`)
    }
  }

  let rawCopy: CopyDoc
  if (gate.ok) {
    rawCopy = gate.data
  } else {
    warnings.push(
      `copywriter output invalid after repair (${gate.errors.slice(0, 3).join('; ')}) — using stub copy for every section`,
    )
    rawCopy = { sections: [] }
  }

  const reconciled = reconcileCopy(blueprint.sections, rawCopy)
  warnings.push(...reconciled.warnings)

  const truncated = truncateHeadlines(blueprint.sections, reconciled.copy)
  warnings.push(...truncated.warnings)

  return { ok: true, copy: truncated.copy, warnings }
}

/* ---------- F4: reconcile by id against the blueprint ---------- */

function stubHeadlineFromBrief(brief: string): string {
  const clause = brief.split(/[.!?]/)[0]?.trim() || brief.trim()
  const words = clause.split(/\s+/).filter(Boolean).slice(0, 10)
  const titled = words
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
  return titled.slice(0, 90) || 'Untitled section'
}

function reconcileCopy(
  sections: SectionPlan[],
  rawCopy: CopyDoc,
): { copy: CopyDoc; warnings: string[] } {
  const warnings: string[] = []
  const byId = new Map(rawCopy.sections.map((c) => [c.id, c]))
  const blueprintIds = new Set(sections.map((s) => s.id))
  const extras = rawCopy.sections.filter((c) => !blueprintIds.has(c.id))
  if (extras.length) {
    warnings.push(
      `copywriter returned ${extras.length} section id(s) not in the blueprint — dropped: ${extras
        .map((e) => e.id)
        .join(', ')}`,
    )
  }

  const out: SectionCopy[] = sections.map((sp) => {
    const found = byId.get(sp.id)
    if (found) return found
    warnings.push(
      `section "${sp.id}": copywriter omitted this id — using stub copy from contentBrief`,
    )
    return { id: sp.id, headline: stubHeadlineFromBrief(sp.contentBrief) }
  })
  return { copy: { sections: out }, warnings }
}

/* ---------- animation-aware headline truncation (§5.2 field rules) ---------- */

function maxHeadlineWords(section: SectionPlan): number {
  if (section.animation.intent === 'split-text-reveal') {
    return section.animation.params.unit === 'chars' ? 4 : 8
  }
  return 10
}

function truncateHeadlines(
  sections: SectionPlan[],
  copy: CopyDoc,
): { copy: CopyDoc; warnings: string[] } {
  const warnings: string[] = []
  const byId = new Map(sections.map((s) => [s.id, s]))
  const out = copy.sections.map((c) => {
    const sp = byId.get(c.id)
    if (!sp) return c
    const max = maxHeadlineWords(sp)
    const words = c.headline.trim().split(/\s+/)
    if (words.length <= max) return c
    warnings.push(
      `section "${c.id}": headline truncated to ${max} words for "${sp.animation.intent}" (was ${words.length})`,
    )
    return { ...c, headline: words.slice(0, max).join(' ') }
  })
  return { copy: { sections: out }, warnings }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
