import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { chat } from '../lib/groq'
import { runSectionCodegen } from '../lib/codegen'
import { SectionCopy, SectionKind, SectionPlan, ThemeTokens } from '../lib/schema'

/* ============================================================================
 * generate-section server fn (AGENT_SPEC §7.2).
 *
 * One section in, one validated SectionModule (+warnings) out. The client fans
 * out with Promise.all over per-section calls (concurrency-limited to 3), so
 * single-section regeneration is the exact same endpoint. Server-only: the Groq
 * key never leaves this boundary.
 * ========================================================================== */

export const GenerateSectionInputSchema = z.object({
  tone: z.string(),
  theme: ThemeTokens,
  section: SectionPlan,
  copy: SectionCopy,
  prevKind: SectionKind.optional(),
  nextKind: SectionKind.optional(),
})

export const generateSection = createServerFn({ method: 'POST' })
  .inputValidator(GenerateSectionInputSchema)
  .handler(async ({ data }) => {
    return runSectionCodegen(data, chat)
  })
