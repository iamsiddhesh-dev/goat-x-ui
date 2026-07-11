import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { chat } from '../lib/groq'
import { runPlanner } from '../lib/plan'

/* ============================================================================
 * plan server fn (AGENT_SPEC §7.2, §8 Phase 3).
 *
 * prompt in, a validated + composition-corrected PageBlueprint (+warnings) out.
 * Server-only: the Groq key never leaves this boundary.
 * ========================================================================== */

export const PlanInputSchema = z.object({
  prompt: z.string().min(1),
})

export const plan = createServerFn({ method: 'POST' })
  .inputValidator(PlanInputSchema)
  .handler(async ({ data }) => {
    return runPlanner(data.prompt, chat)
  })
