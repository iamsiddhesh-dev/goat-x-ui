/* ============================================================================
 * Provider-agnostic chat contract. plan.ts / write-copy.ts / codegen.ts are
 * written against this shape only, so the LLM backend is swappable at the
 * server-fn wiring layer without touching orchestration or tests (which
 * inject a mock ChatFn). Current provider: gemini.ts.
 * ========================================================================== */

export interface ChatOptions {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
  /** JSON mode (Planner/Copywriter). Codegen leaves this off. */
  json?: boolean
}

/** Injectable LLM call — real impl in gemini.ts, mocked in tests. */
export type ChatFn = (opts: ChatOptions) => Promise<string>
