import type { ChatFn } from './groq'
import { PageBlueprint } from './schema'
import { buildPlannerPrompt, buildRepairPrompt } from './prompts'
import { parseAndValidateJson } from './llm-json'
import {
  applyCompositionRules,
  clampBlueprintParams,
  dedupeSectionIds,
} from './vocabulary'

/* ============================================================================
 * Planner orchestration (AGENT_SPEC §1.1 stage 1, §6, §8 Phase 3).
 *
 * Pure and LLM-agnostic: the ChatFn is injected so parse → repair → gate is
 * exercised by tests with a mock, no live Groq key required.
 *
 * Doctrine (§6): parse (F1) → Zod (F2) → 1 repair call on failure → clamp
 * params (F3) → composition rules R1–R7 auto-correct → unique-id dedupe.
 * A 2nd JSON/shape failure has no page-level fallback (nothing downstream
 * exists yet) — it's surfaced as an error for the caller to offer "retry".
 * ========================================================================== */

export type PlannerResult =
  | { ok: true; blueprint: PageBlueprint; warnings: string[] }
  | { ok: false; errors: string[] }

const PLANNER_TEMPERATURE = 0.8
const PLANNER_MAX_TOKENS = 2500
const REPAIR_TEMPERATURE = 0.2

export async function runPlanner(
  userPrompt: string,
  chatFn: ChatFn,
): Promise<PlannerResult> {
  const prompt = buildPlannerPrompt(userPrompt)

  let raw: string
  try {
    raw = await chatFn({
      system: prompt.system,
      user: prompt.user,
      temperature: PLANNER_TEMPERATURE,
      maxTokens: PLANNER_MAX_TOKENS,
      json: true,
    })
  } catch (e) {
    return { ok: false, errors: [`planner call failed: ${errMsg(e)}`] }
  }

  let gate = parseAndValidateJson(raw, PageBlueprint)

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
        maxTokens: PLANNER_MAX_TOKENS,
        json: true,
      })
      gate = parseAndValidateJson(repairRaw, PageBlueprint)
    } catch (e) {
      return { ok: false, errors: [`planner repair call failed: ${errMsg(e)}`] }
    }
    if (!gate.ok) return { ok: false, errors: gate.errors }
  }

  const warnings: string[] = []
  let blueprint: PageBlueprint = gate.data

  const clamped = clampBlueprintParams(blueprint)
  blueprint = clamped.blueprint
  warnings.push(...clamped.warnings)

  const composed = applyCompositionRules(blueprint)
  blueprint = composed.blueprint
  warnings.push(...composed.warnings)

  const deduped = dedupeSectionIds(blueprint)
  blueprint = deduped.blueprint
  warnings.push(...deduped.warnings)

  return { ok: true, blueprint, warnings }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
