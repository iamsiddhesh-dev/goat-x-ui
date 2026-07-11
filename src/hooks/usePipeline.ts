import { useCallback, useRef, useState } from 'react'
import type { PageBundle } from '../lib/schema'
import {
  regenerateSection as regenerateSectionRequest,
  runPipeline,
  type PipelineStageEvent,
  type StageStatus,
} from '../lib/pipeline'

/* ============================================================================
 * usePipeline (AGENT_SPEC §7.3, §8 Phase 4).
 *
 * Thin React state wrapper around lib/pipeline.ts: PipelineState-shaped status
 * (planner/copywriter/per-section) driving the progress UI, plus the bundle
 * once assembled. `generate` starts a fresh run; `regenerateSection` re-runs
 * one section's codegen and hot-swaps it into the current bundle.
 * ========================================================================== */

export interface UsePipelineState {
  prompt: string
  planner: StageStatus
  copywriter: StageStatus
  // Known as soon as the blueprint is planned — lets the UI render pending
  // section rows well before codegen (or the full bundle) finishes.
  sectionIds: string[]
  sections: Record<string, StageStatus>
  sectionOrigin: Record<string, string>
  bundle?: PageBundle
  error?: string
  isRunning: boolean
}

const initialState: UsePipelineState = {
  prompt: '',
  planner: 'idle',
  copywriter: 'idle',
  sectionIds: [],
  sections: {},
  sectionOrigin: {},
  isRunning: false,
}

export function usePipeline() {
  const [state, setState] = useState<UsePipelineState>(initialState)
  // Guards stale writes from a superseded run (e.g. user hits "generate" twice).
  const runToken = useRef(0)

  const handleStage = useCallback(
    (token: number, event: PipelineStageEvent) => {
      if (token !== runToken.current) return
      setState((prev) => {
        if (event.stage === 'planner') return { ...prev, planner: event.status }
        if (event.stage === 'copywriter')
          return { ...prev, copywriter: event.status }
        const sectionId = event.sectionId!
        return {
          ...prev,
          sections: { ...prev.sections, [sectionId]: event.status },
          sectionOrigin:
            event.status === 'done' && event.message
              ? { ...prev.sectionOrigin, [sectionId]: event.message }
              : prev.sectionOrigin,
        }
      })
    },
    [],
  )

  const generate = useCallback(async (prompt: string) => {
    const token = ++runToken.current
    setState({
      ...initialState,
      prompt,
      isRunning: true,
    })
    try {
      const bundle = await runPipeline(prompt, {
        onStage: (event) => handleStage(token, event),
        onBlueprint: (blueprint) => {
          if (token !== runToken.current) return
          setState((prev) => ({
            ...prev,
            sectionIds: blueprint.sections.map((s) => s.id),
          }))
        },
      })
      if (token !== runToken.current) return
      setState((prev) => ({ ...prev, bundle, isRunning: false }))
    } catch (e) {
      if (token !== runToken.current) return
      setState((prev) => ({
        ...prev,
        isRunning: false,
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }, [handleStage])

  const regenerateSection = useCallback(
    async (sectionId: string) => {
      const token = runToken.current
      setState((prev) => ({
        ...prev,
        sections: { ...prev.sections, [sectionId]: 'running' },
      }))
      try {
        const current = state.bundle
        if (!current) return
        const bundle = await regenerateSectionRequest(current, sectionId, {
          onStage: (event) => handleStage(token, event),
        })
        if (token !== runToken.current) return
        setState((prev) => ({ ...prev, bundle }))
      } catch (e) {
        if (token !== runToken.current) return
        setState((prev) => ({
          ...prev,
          sections: { ...prev.sections, [sectionId]: 'error' },
          error: e instanceof Error ? e.message : String(e),
        }))
      }
    },
    [handleStage, state.bundle],
  )

  return { state, generate, regenerateSection }
}
