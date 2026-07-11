import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { chat } from '../lib/gemini'
import { runCopywriter } from '../lib/write-copy'
import { PageBlueprint } from '../lib/schema'

/* ============================================================================
 * write-copy server fn (AGENT_SPEC §7.2, §8 Phase 3).
 *
 * (prompt, blueprint) in, a reconciled CopyDoc (+warnings) out. Never
 * hard-fails: a fully unusable copywriter output still reconciles to
 * deterministic stub copy for every section (§6 F4).
 * ========================================================================== */

export const WriteCopyInputSchema = z.object({
  prompt: z.string().min(1),
  blueprint: PageBlueprint,
})

export const writeCopy = createServerFn({ method: 'POST' })
  .inputValidator(WriteCopyInputSchema)
  .handler(async ({ data }) => {
    return runCopywriter(data.prompt, data.blueprint, chat)
  })
