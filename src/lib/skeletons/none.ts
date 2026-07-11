import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, itemCards, subheadline } from './shared'

/* Static section, no animation (intent: none). */
export const noneSkeleton: SectionSkeletonFn = ({ id, copy }): SectionModule => ({
  id,
  origin: 'fallback',
  html: `<section data-section="${id}" class="s-${id}">
  <div class="container">
    ${eyebrow(copy)}
    ${headline(copy)}
    ${subheadline(copy)}
    ${bodyText(copy)}
    ${copy.items ? `<div class="grid">
      ${itemCards(copy)}
    </div>` : ''}
    ${ctaButton(copy)}
  </div>
</section>`,
  css: `.s-${id} .container{display:flex;flex-direction:column;gap:1.25rem;max-width:820px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2rem,5vw,3.25rem)}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem)}
.s-${id} .body{color:var(--muted)}
.s-${id} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.s-${id} .item{background:var(--surface);border-radius:var(--radius);padding:1.25rem}
.s-${id} .item-title{font-size:1.1rem}
.s-${id} .item-body{color:var(--muted);margin-top:.4rem;font-size:.95rem}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:.5rem}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}`,
  js: `// static section (intent: none) — no animation by design`,
})
