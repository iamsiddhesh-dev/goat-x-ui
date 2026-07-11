/* ============================================================================
 * Sliding-window request-rate gate. Server-only.
 *
 * Several free-tier providers we've hit (Cerebras: 5 req/min account-wide,
 * Gemini regular Flash: 5 req/min per-model) cap requests-per-minute far below
 * what the 3-way concurrent section fan-out (§7.3) wants to fire. Rather than
 * let calls 429 and cascade into repair → fallback skeleton, each provider's
 * chat() acquires a slot here first — concurrent callers queue in arrival
 * order and wait only as long as the window actually requires.
 *
 * Module-level state per gate instance: fine for a single dev process (demo
 * scope), not meant to survive a multi-instance deployment.
 * ========================================================================== */

export interface RateGate {
  /** Resolves once it's safe to fire the next request without breaching the cap. */
  acquireSlot(): Promise<void>
}

export function createRateGate(limit: number, windowMs: number): RateGate {
  const callTimestamps: number[] = []
  let chain: Promise<void> = Promise.resolve()

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function acquireSlot(): Promise<void> {
    const next = chain.then(async () => {
      for (;;) {
        const now = Date.now()
        while (callTimestamps.length && now - callTimestamps[0] >= windowMs) {
          callTimestamps.shift()
        }
        if (callTimestamps.length < limit) {
          callTimestamps.push(now)
          return
        }
        await sleep(callTimestamps[0] + windowMs - now + 50)
      }
    })
    // Keep the chain alive even if this slot's caller later throws.
    chain = next.catch(() => {})
    return next
  }

  return { acquireSlot }
}
