import type { SectionCopy } from '../schema'

/* ============================================================================
 * Shared helpers for the deterministic fallback skeletons (AGENT_SPEC §4.5).
 *
 * A skeleton is the known-good implementation of an intent, executed with the
 * section's REAL copy + theme + clamped params. It doubles as the fallback
 * module when codegen fails twice (F5). Every skeleton must itself pass the
 * validator: obey rule C9 (all hidden/offset states in JS, never CSS), use only
 * whitelisted tween properties + eases, and only pin inside pin-category intents.
 *
 * These builders turn CopyDoc fields into standard, escaped markup fragments so
 * each skeleton only has to describe its own animation-specific DOM.
 * ========================================================================== */

/** HTML-escape text destined for element bodies / attribute values. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function eyebrow(copy: SectionCopy): string {
  return copy.eyebrow ? `<p class="eyebrow">${esc(copy.eyebrow)}</p>` : ''
}

export function headline(copy: SectionCopy, tag: 'h1' | 'h2' = 'h2'): string {
  return `<${tag} class="headline">${esc(copy.headline)}</${tag}>`
}

export function subheadline(copy: SectionCopy): string {
  return copy.subheadline
    ? `<p class="sub">${esc(copy.subheadline)}</p>`
    : ''
}

export function bodyText(copy: SectionCopy): string {
  return copy.body ? `<p class="body">${esc(copy.body)}</p>` : ''
}

export function ctaButton(copy: SectionCopy): string {
  if (!copy.cta) return ''
  const sub = copy.cta.sub
    ? `<span class="cta-sub">${esc(copy.cta.sub)}</span>`
    : ''
  return `<div class="cta-row">
      <a class="btn" href="#">${esc(copy.cta.label)}</a>
      ${sub}
    </div>`
}

/** Split a stat string like "$4.2M" or "250+" into { prefix, value, suffix }. */
export function parseStatNumber(text: string): {
  prefix: string
  value: number
  suffix: string
} {
  const m = text.match(/^([^\d.]*)([\d.]+)(.*)$/)
  if (!m) return { prefix: '', value: 0, suffix: text }
  return { prefix: m[1], value: Number(m[2]), suffix: m[3] }
}

/** Feature/step/logo items → list of `<div class="item">…</div>`. */
export function itemCards(copy: SectionCopy, extraClass = ''): string {
  if (!copy.items || copy.items.length === 0) return ''
  const cls = `item${extraClass ? ' ' + extraClass : ''}`
  return copy.items
    .map(
      (it) => `<div class="${cls}">
        <h3 class="item-title">${esc(it.title)}</h3>
        ${it.body ? `<p class="item-body">${esc(it.body)}</p>` : ''}
      </div>`,
    )
    .join('\n      ')
}
