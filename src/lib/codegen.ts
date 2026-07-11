import type { ChatFn } from './groq'
import type {
  SectionCopy,
  SectionKind,
  SectionModule,
  SectionPlan,
  ThemeTokens,
} from './schema'
import { clampParams } from './vocabulary'
import { buildCodegenPrompt, buildRepairPrompt } from './prompts'
import { validateModule } from './validate'
import { skeletonFor } from './skeletons'

/* ============================================================================
 * Per-section codegen orchestration (AGENT_SPEC §1.1 stage 3–4, §6).
 *
 * Pure and LLM-agnostic: the ChatFn is injected, so the whole
 * codegen → validate → (1×) repair → deterministic fallback path is exercised
 * by tests with a mock, no live Groq key required.
 *
 * Doctrine (§6): max ONE repair per section; a second failure lands on the
 * fallback skeleton (origin: 'fallback'); the section NEVER hard-fails the page.
 * ========================================================================== */

export interface GenerateSectionInput {
  tone: string
  theme: ThemeTokens
  section: SectionPlan
  copy: SectionCopy
  prevKind?: SectionKind
  nextKind?: SectionKind
}

export interface GenerateSectionResult {
  module: SectionModule
  warnings: string[]
}

const CODEGEN_TEMPERATURE = 0.45
const REPAIR_TEMPERATURE = 0.2
const CODEGEN_MAX_TOKENS = 3000

export async function runSectionCodegen(
  input: GenerateSectionInput,
  chatFn: ChatFn,
): Promise<GenerateSectionResult> {
  const { section, copy, theme } = input
  const intent = section.animation.intent

  // Params are clamped again here (belt & suspenders — the Planner also clamps).
  const { params, warnings } = clampParams(section.animation)

  const buildSkeleton = (reason: string): GenerateSectionResult => {
    const module = skeletonFor(intent)({
      id: section.id,
      kind: section.kind,
      copy,
      theme,
      params,
    })
    return { module, warnings: [...warnings, reason] }
  }

  const prompt = buildCodegenPrompt({
    tone: input.tone,
    theme,
    section,
    clampedParams: params,
    copy,
    prevKind: input.prevKind,
    nextKind: input.nextKind,
  })

  // -- attempt 1: generate --
  let firstRaw: string
  try {
    firstRaw = await chatFn({
      system: prompt.system,
      user: prompt.user,
      temperature: CODEGEN_TEMPERATURE,
      maxTokens: CODEGEN_MAX_TOKENS,
    })
  } catch (e) {
    // F13: Groq error/timeout with no output to repair → straight to fallback.
    return buildSkeleton(
      `section "${section.id}": codegen call failed (${errMsg(e)}) — using fallback skeleton`,
    )
  }

  const first = validateModule(firstRaw, { id: section.id, intent })
  if (first.ok && first.module) {
    return { module: first.module, warnings }
  }

  // -- attempt 2: one repair with the specific validator errors (§5.4) --
  let repairRaw: string
  try {
    const repair = buildRepairPrompt({
      originalUser: prompt.user,
      previousRaw: firstRaw,
      errors: first.errors,
    })
    repairRaw = await chatFn({
      system: repair.system,
      user: repair.user,
      temperature: REPAIR_TEMPERATURE,
      maxTokens: CODEGEN_MAX_TOKENS,
    })
  } catch (e) {
    return buildSkeleton(
      `section "${section.id}": repair call failed (${errMsg(e)}) — using fallback skeleton`,
    )
  }

  const repaired = validateModule(repairRaw, {
    id: section.id,
    intent,
    origin: 'repaired',
  })
  if (repaired.ok && repaired.module) {
    return {
      module: repaired.module,
      warnings: [
        ...warnings,
        `section "${section.id}": repaired after ${first.errors.length} validator error(s)`,
      ],
    }
  }

  // -- both attempts failed: deterministic fallback skeleton (§6 F5) --
  return buildSkeleton(
    `section "${section.id}": codegen failed twice — using fallback skeleton (last errors: ${repaired.errors
      .slice(0, 2)
      .join('; ')})`,
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
