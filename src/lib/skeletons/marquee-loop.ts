import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { esc, eyebrow, headline } from './shared'

/* Infinite horizontal marquee, ambient / no ScrollTrigger (marquee-loop). */
export const marqueeLoopSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const speedSec = Number(params.speedSec ?? 24)
  const direction = String(params.direction ?? 'left')
  const target = direction === 'left' ? -50 : 50

  // Chip labels: prefer logo/keyword items, else split the headline into words.
  const labels =
    copy.items && copy.items.length
      ? copy.items.map((it) => it.title)
      : copy.headline.split(/\s+/).filter(Boolean)
  const chips = labels.map((l) => `<span class="chip">${esc(l)}</span>`).join('')
  // Render the list twice inside one track for a seamless loop.
  const groupHtml = `<div class="group">${chips}</div><div class="group" aria-hidden="true">${chips}</div>`

  const hasHead = Boolean(copy.eyebrow || copy.headline)

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  ${hasHead ? `<div class="container head">
    ${eyebrow(copy)}
    ${copy.headline ? headline(copy) : ''}
  </div>` : ''}
  <div class="marquee">
    <div class="track">${groupHtml}</div>
  </div>
</section>`,
    css: `.s-${id} .head{display:flex;flex-direction:column;gap:.75rem;max-width:820px;margin-bottom:2.5rem}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(1.75rem,4vw,2.75rem)}
.s-${id} .marquee{overflow:hidden;width:100%;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.s-${id} .track{display:flex;width:max-content;will-change:transform}
.s-${id} .group{display:flex;gap:1rem;padding-right:1rem}
.s-${id} .chip{white-space:nowrap;background:var(--surface);border:1px solid var(--surface);color:var(--text);padding:.9rem 1.6rem;border-radius:999px;font-family:var(--font-display);font-size:clamp(1.1rem,2.5vw,1.6rem)}`,
    js: `var track = root.querySelector('.track');
gsap.to(track, { xPercent: ${target}, duration: ${speedSec}, ease: 'none', repeat: -1 });`,
  }
}
