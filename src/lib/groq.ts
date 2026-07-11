import Groq from 'groq-sdk'

/* ============================================================================
 * Groq client factory + thin chat helpers (AGENT_SPEC §7.2). Server-only.
 *
 * `llama-3.3-70b-versatile` for every stage. Planner/Copywriter use JSON mode;
 * Codegen/Repair return delimited text. The `ChatFn` type lets the codegen
 * orchestrator (generate-section) be driven by a mock in tests — no live key
 * needed to exercise the validate → repair → fallback path.
 * ========================================================================== */

export const GROQ_MODEL = 'llama-3.3-70b-versatile'

export interface ChatOptions {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
  /** Groq JSON mode (Planner/Copywriter). Codegen leaves this off. */
  json?: boolean
}

/** Injectable LLM call — real impl below, mocked in tests. */
export type ChatFn = (opts: ChatOptions) => Promise<string>

let client: Groq | null = null

export function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not set — required for live generation (set it in your env / .env).',
    )
  }
  if (!client) client = new Groq({ apiKey })
  return client
}

/** One chat completion → assistant message content (string). */
export const chat: ChatFn = async (opts) => {
  const res = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 3000,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  })
  const content = res.choices[0]?.message?.content
  if (!content || !content.trim()) {
    throw new Error('Groq returned an empty completion')
  }
  return content
}
