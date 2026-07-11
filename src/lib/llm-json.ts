import type { z } from 'zod'

/* ============================================================================
 * Shared JSON gate for JSON-mode LLM stages (Planner, Copywriter) — AGENT_SPEC
 * §6 F1/F2. Groq JSON mode makes malformed output rare, but the gate still
 * strips markdown fences / leading-trailing prose (F1) before parsing, then
 * runs the stage's Zod schema (F2). Never throws.
 * ========================================================================== */

export type JsonGateResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] }

/** F1 — strip a wrapping ```json fence and grab first `{` … last `}`. */
export function extractJson(raw: string): string {
  let t = raw.trim()
  const fenced = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  if (fenced) t = fenced[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return t
  return t.slice(start, end + 1)
}

function formatZodPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, seg, i) => {
    if (typeof seg === 'number') return `${acc}[${seg}]`
    return i === 0 ? String(seg) : `${acc}.${seg}`
  }, '')
}

/** F1 (parse) + F2 (shape) in one gate. Never throws. */
export function parseAndValidateJson<S extends z.ZodTypeAny>(
  raw: string,
  schema: S,
): JsonGateResult<z.infer<S>> {
  const jsonText = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    return { ok: false, errors: [`JSON parse error: ${(e as Error).message}`] }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (iss) => `${formatZodPath(iss.path)}: ${iss.message}`,
      ),
    }
  }
  return { ok: true, data: result.data }
}
