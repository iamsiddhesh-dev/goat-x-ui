import { z } from 'zod'

/* ============================================================================
 * Data Contracts (AGENT_SPEC §3) — single source of truth.
 * Every arrow in the pipeline diagram carries exactly one of these shapes.
 * ========================================================================== */

/* ---------- shared ---------- */

// Slugs double as DOM ids: [a-z0-9-], unique per page.
export const SectionId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(24)

export const SectionKind = z.enum([
  'hero',
  'logos',
  'feature-grid',
  'showcase',
  'process',
  'stats',
  'testimonial',
  'pricing',
  'faq',
  'cta',
  'footer',
])
export type SectionKind = z.infer<typeof SectionKind>

/* ---------- theme (Planner output) ---------- */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const ThemeTokens = z.object({
  mode: z.enum(['dark', 'light']), // required — drives contrast choices downstream
  colors: z.object({
    bg: hex,
    surface: hex,
    text: hex,
    muted: hex,
    accent: hex,
    accentContrast: hex, // accentContrast = text color usable ON accent
  }),
  fonts: z.object({
    // must come from the whitelist below; Planner prompt embeds the list
    display: z.string(), // e.g. "Space Grotesk"
    body: z.string(), // e.g. "Inter"
  }),
  radius: z.number().int().min(0).max(32), // px, global corner radius
})
export type ThemeTokens = z.infer<typeof ThemeTokens>

/* ---------- animation spec (Planner output, per section) ---------- */

export const AnimationIntentId = z.enum([
  'none',
  'fade-up-stagger',
  'split-text-reveal',
  'mask-wipe',
  'scale-settle',
  'parallax-drift',
  'reverse-parallax',
  'scrub-choreography',
  'horizontal-scroll-track',
  'pinned-step-sequence',
  'sticky-card-stack',
  'marquee-loop',
  'count-up-stats',
  'theme-shift',
])
export type AnimationIntentId = z.infer<typeof AnimationIntentId>

export const AnimationSpec = z.object({
  intent: AnimationIntentId,
  // Free-form param bag; validated + CLAMPED per-intent by the vocabulary layer (§4.3).
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  // One sentence of creative direction the Code Generator may use.
  note: z.string().max(200).optional(),
})
export type AnimationSpec = z.infer<typeof AnimationSpec>

/* ---------- Planner output ---------- */

export const SectionPlan = z.object({
  id: SectionId,
  kind: SectionKind,
  // What this section communicates — the Copywriter's brief for it. 1–2 sentences.
  contentBrief: z.string().min(10).max(300),
  // Optional layout nudge for the Code Generator.
  layoutHint: z.string().max(120).optional(),
  animation: AnimationSpec,
})
export type SectionPlan = z.infer<typeof SectionPlan>

export const PageBlueprint = z.object({
  meta: z.object({
    title: z.string().max(70),
    description: z.string().max(160),
  }),
  // Voice for the Copywriter: 2–4 adjectives + a register note.
  tone: z.string().min(3).max(160),
  theme: ThemeTokens,
  sections: z.array(SectionPlan).min(3).max(8),
})
export type PageBlueprint = z.infer<typeof PageBlueprint>
// Post-parse invariants (checked in code, not Zod): unique section ids;
// composition rules R1–R6 — violations are auto-corrected, not rejected.

/* ---------- Copywriter output ---------- */

// One uniform copy shape covers all section kinds; unused fields are omitted.
export const SectionCopy = z.object({
  id: SectionId, // must match a blueprint section
  eyebrow: z.string().max(40).optional(), // small kicker above headline
  headline: z.string().min(2).max(90), // REQUIRED for every section
  subheadline: z.string().max(180).optional(),
  body: z.string().max(400).optional(),
  items: z
    .array(
      z.object({
        // features, steps, cards, FAQs, logos…
        title: z.string().max(60),
        body: z.string().max(200).optional(),
      }),
    )
    .max(8)
    .optional(),
  stats: z
    .array(
      z.object({
        // required if intent === 'count-up-stats'
        value: z.string().max(12), // "4.9", "12k+", "99.99%" — string, codegen parses digits
        label: z.string().max(40),
      }),
    )
    .max(4)
    .optional(),
  cta: z
    .object({
      label: z.string().max(30),
      sub: z.string().max(60).optional(), // reassurance line
    })
    .optional(),
})
export type SectionCopy = z.infer<typeof SectionCopy>

export const CopyDoc = z.object({
  sections: z.array(SectionCopy),
})
export type CopyDoc = z.infer<typeof CopyDoc>
// Post-parse: reconcile against blueprint by id — see failure F4.

/* ---------- Code Generator output (per section) ---------- */

// NOTE: the codegen LLM does NOT emit JSON (§5.3). It emits delimited blocks;
// the server parses them into this shape.
export const SectionModule = z.object({
  id: SectionId,
  html: z.string().min(20), // exactly one root: <section data-section="{id}" class="s-{id}">…</section>
  css: z.string().default(''), // auto-prefixed with [data-section="{id}"] by the validator
  js: z.string().min(10), // BODY of function (root) { … } — statements only, no wrapper
  origin: z.enum(['generated', 'repaired', 'fallback']).default('generated'),
})
export type SectionModule = z.infer<typeof SectionModule>

/* ---------- assembled result + pipeline state ---------- */

export const PageBundle = z.object({
  blueprint: PageBlueprint,
  copy: CopyDoc,
  sections: z.array(SectionModule),
  html: z.string(), // full assembled document
  warnings: z.array(z.string()), // clamps, fallbacks, reconciliations — surfaced in UI
})
export type PageBundle = z.infer<typeof PageBundle>

export const StageStatus = z.enum(['idle', 'running', 'done', 'error'])
export type StageStatus = z.infer<typeof StageStatus>

export const PipelineState = z.object({
  // client-side store shape
  prompt: z.string(),
  planner: StageStatus,
  copywriter: StageStatus,
  sections: z.record(z.string(), StageStatus), // per section id
  bundle: PageBundle.partial().optional(),
})
export type PipelineState = z.infer<typeof PipelineState>
