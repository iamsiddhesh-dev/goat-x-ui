import type { ChatFn } from './llm'
import { createRateGate } from './rate-gate'

/* ============================================================================
 * Gemini client + thin chat helper (AGENT_SPEC §7.2 equivalent). Server-only.
 *
 * Implements the ChatFn contract (lib/llm.ts). Plain fetch against the REST
 * API — no SDK dependency needed for a single-call shape.
 * ========================================================================== */

// Regular Flash, not flash-lite: better creative/code quality, chosen when
// output quality matters more than latency. Tradeoff (measured on this
// account): capped at 5 requests/min per model on the free tier — same order
// of magnitude as Cerebras's account-wide cap — vs. flash-lite's much higher
// headroom (12+ concurrent calls with zero 429s). The rate gate below queues
// around that cap instead of cascading into repair → fallback skeleton.
// Revisit if Google reshuffles quotas again.
export const GEMINI_MODEL = 'gemini-3-flash-preview'

const rateGate = createRateGate(5, 60_000)

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set — required for live generation (set it in your env / .env).',
    )
  }
  return apiKey
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

/** One chat completion → assistant message content (string). */
export const chat: ChatFn = async (opts) => {
  const apiKey = getGeminiApiKey()
  await rateGate.acquireSlot()
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.5,
        maxOutputTokens: opts.maxTokens ?? 3000,
        // Every Gemini 3.x model "thinks" by default, which both burns the
        // maxOutputTokens budget on reasoning and (for non-JSON calls) can
        // leak preamble text ahead of the actual answer — fatal for the
        // strict ===HTML===/===CSS===/===JS=== delimiter parse in codegen.
        thinkingConfig: { thinkingBudget: 0 },
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini request failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as GeminiResponse
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`)
  }

  const content = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')

  if (!content || !content.trim()) {
    const finishReason = data.candidates?.[0]?.finishReason
    throw new Error(
      finishReason === 'MAX_TOKENS'
        ? 'Gemini hit maxOutputTokens before producing any text'
        : `Gemini returned an empty completion (finishReason: ${finishReason ?? 'unknown'})`,
    )
  }
  return content
}
