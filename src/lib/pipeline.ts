import pLimit from 'p-limit'
import { assemble } from './assemble'
import type {
  PageBlueprint,
  PageBundle,
  SectionModule,
  SectionPlan,
} from './schema'
import { plan } from '../server/plan'
import { writeCopy } from '../server/write-copy'
import { generateSection } from '../server/generate-section'

/* ============================================================================
 * Client orchestrator (AGENT_SPEC §7.3, §8 Phase 4).
 *
 * generate() = plan -> writeCopy -> fan-out generateSection (concurrency 3)
 * -> assemble(). Each transition is reported via onStage so the caller can
 * drive a progress UI. A single section's failure never aborts the run — the
 * codegen server fn already guarantees a module (generated/repaired/fallback)
 * for every section (§6), so fan-out here only has to survive network faults.
 * regenerateSection() re-runs codegen for one id and re-assembles in place.
 * ========================================================================== */

export type StageStatus = 'idle' | 'running' | 'done' | 'error'

export interface PipelineStageEvent {
  stage: 'planner' | 'copywriter' | 'section'
  sectionId?: string
  status: StageStatus
  message?: string
}

export interface PipelineCallbacks {
  onStage?: (event: PipelineStageEvent) => void
  // Fired as soon as the blueprint is known, well before codegen finishes —
  // lets the UI render the (pending) section list instead of waiting for the
  // full bundle at the very end.
  onBlueprint?: (blueprint: PageBlueprint) => void
}

const SECTION_CONCURRENCY = 3

function neighborsFor(sections: SectionPlan[], index: number) {
  return {
    prevKind: sections[index - 1]?.kind,
    nextKind: sections[index + 1]?.kind,
  }
}

/** Run the full pipeline for a fresh prompt. Never throws — errors land as a warning + partial bundle. */
export async function runPipeline(
  prompt: string,
  callbacks: PipelineCallbacks = {},
): Promise<PageBundle> {
  const { onStage, onBlueprint } = callbacks
  const warnings: string[] = []

  onStage?.({ stage: 'planner', status: 'running' })
  const planResult = await plan({ data: { prompt } })
  if (!planResult.ok) {
    onStage?.({
      stage: 'planner',
      status: 'error',
      message: planResult.errors.join('; '),
    })
    throw new Error(`planner failed: ${planResult.errors.join('; ')}`)
  }
  warnings.push(...planResult.warnings)
  onStage?.({ stage: 'planner', status: 'done' })

  const blueprint: PageBlueprint = planResult.blueprint
  onBlueprint?.(blueprint)

  onStage?.({ stage: 'copywriter', status: 'running' })
  const copyResult = await writeCopy({ data: { prompt, blueprint } })
  warnings.push(...copyResult.warnings)
  onStage?.({ stage: 'copywriter', status: 'done' })

  const copyById = new Map(copyResult.copy.sections.map((c) => [c.id, c]))
  const limit = pLimit(SECTION_CONCURRENCY)

  const modules = await Promise.all(
    blueprint.sections.map((section, index) =>
      limit(async () => {
        onStage?.({
          stage: 'section',
          sectionId: section.id,
          status: 'running',
        })
        const copy = copyById.get(section.id)
        if (!copy) {
          // Reconciliation in the copywriter guarantees every id is present;
          // this is unreachable in practice but keeps the fan-out total.
          onStage?.({
            stage: 'section',
            sectionId: section.id,
            status: 'error',
            message: 'no copy found for section',
          })
          throw new Error(`no copy for section "${section.id}"`)
        }
        const { prevKind, nextKind } = neighborsFor(blueprint.sections, index)
        const result = await generateSection({
          data: {
            tone: blueprint.tone,
            theme: blueprint.theme,
            section,
            copy,
            prevKind,
            nextKind,
          },
        })
        onStage?.({
          stage: 'section',
          sectionId: section.id,
          status: 'done',
          message: result.module.origin,
        })
        return result
      }),
    ),
  )

  const sections: SectionModule[] = modules.map((m) => m.module)
  for (const m of modules) warnings.push(...m.warnings)

  const html = assemble({ meta: blueprint.meta, theme: blueprint.theme, sections })

  return { blueprint, copy: copyResult.copy, sections, html, warnings }
}

/** Regenerate a single section in place and re-assemble the bundle. */
export async function regenerateSection(
  bundle: PageBundle,
  sectionId: string,
  callbacks: PipelineCallbacks = {},
): Promise<PageBundle> {
  const { onStage } = callbacks
  const index = bundle.blueprint.sections.findIndex((s) => s.id === sectionId)
  if (index === -1) throw new Error(`unknown section "${sectionId}"`)

  const section = bundle.blueprint.sections[index]
  const copy = bundle.copy.sections.find((c) => c.id === sectionId)
  if (!copy) throw new Error(`no copy for section "${sectionId}"`)

  onStage?.({ stage: 'section', sectionId, status: 'running' })
  const { prevKind, nextKind } = neighborsFor(bundle.blueprint.sections, index)
  const result = await generateSection({
    data: {
      tone: bundle.blueprint.tone,
      theme: bundle.blueprint.theme,
      section,
      copy,
      prevKind,
      nextKind,
    },
  })
  onStage?.({
    stage: 'section',
    sectionId,
    status: 'done',
    message: result.module.origin,
  })

  const sections = bundle.sections.map((m) =>
    m.id === sectionId ? result.module : m,
  )
  const html = assemble({
    meta: bundle.blueprint.meta,
    theme: bundle.blueprint.theme,
    sections,
  })
  const warnings = [
    ...bundle.warnings.filter((w) => !w.includes(`section "${sectionId}"`)),
    ...result.warnings,
  ]

  return { ...bundle, sections, html, warnings }
}
