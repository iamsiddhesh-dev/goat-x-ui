/* ============================================================================
 * Font whitelist (AGENT_SPEC §3) + Google Fonts URL builder.
 * The Planner may only pick from these; the assembler builds the CSS2 URL.
 * ========================================================================== */

export const DISPLAY_FONTS = [
  'Space Grotesk',
  'Sora',
  'Archivo',
  'Syne',
  'Unbounded',
  'Instrument Serif',
  'Playfair Display',
  'Bricolage Grotesque',
] as const

export const BODY_FONTS = [
  'Inter',
  'Manrope',
  'DM Sans',
  'Figtree',
  'IBM Plex Sans',
] as const

const SERIF_FONTS = new Set(['Instrument Serif', 'Playfair Display'])

/** Generic CSS fallback family for a given whitelist font. */
export function genericFallback(font: string): 'serif' | 'sans-serif' {
  return SERIF_FONTS.has(font) ? 'serif' : 'sans-serif'
}

/** Coerce an arbitrary string to a valid whitelist font, falling back safely. */
export function resolveDisplayFont(name: string): string {
  return DISPLAY_FONTS.includes(name as (typeof DISPLAY_FONTS)[number])
    ? name
    : 'Space Grotesk'
}

export function resolveBodyFont(name: string): string {
  return BODY_FONTS.includes(name as (typeof BODY_FONTS)[number])
    ? name
    : 'Inter'
}

/** Encode a family name for the Google Fonts CSS2 `family=` param. */
function familyParam(name: string, weights: string): string {
  return `family=${name.trim().replace(/\s+/g, '+')}:wght@${weights}`
}

/**
 * Build a single Google Fonts CSS2 URL for the display + body pair.
 * Display gets heavier weights (headlines); body gets text weights.
 */
export function googleFontsUrl(display: string, body: string): string {
  const d = resolveDisplayFont(display)
  const b = resolveBodyFont(body)
  const params = [familyParam(d, '400;500;700'), familyParam(b, '400;500;600')]
  // dedupe in the rare case display === body
  const unique = Array.from(new Set(params))
  return `https://fonts.googleapis.com/css2?${unique.join('&')}&display=swap`
}
