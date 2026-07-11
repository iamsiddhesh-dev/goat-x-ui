import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { esc } from './shared'

/* Section pins; an inner track of panels translates horizontally (horizontal-scroll-track). */
export const horizontalScrollTrackSkeleton: SectionSkeletonFn = ({
  id,
  copy,
}): SectionModule => {
  // Build real panels from copy.items; fall back to headline/sub/body if sparse.
  let panels = (copy.items ?? []).map((it, i) => ({
    num: String(i + 1).padStart(2, '0'),
    title: it.title,
    body: it.body ?? '',
  }))
  if (panels.length < 2) {
    panels = [
      { num: '01', title: copy.headline, body: copy.subheadline ?? '' },
      { num: '02', title: copy.subheadline ?? copy.headline, body: copy.body ?? '' },
    ]
  }
  const n = panels.length

  const panelHtml = panels
    .map(
      (p) => `<article class="panel">
      <span class="num">${esc(p.num)}</span>
      <h2 class="panel-title">${esc(p.title)}</h2>
      ${p.body ? `<p class="panel-body">${esc(p.body)}</p>` : ''}
    </article>`,
    )
    .join('\n    ')

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="track">
    ${panelHtml}
  </div>
</section>`,
    css: `.s-${id}{background:var(--surface);overflow:hidden}
.s-${id} .track{display:flex;flex-direction:column;gap:3rem}
.s-${id} .track.is-animated{flex-direction:row;flex-wrap:nowrap;gap:0;min-height:100vh;width:${n * 100}%}
.s-${id} .panel{display:flex;flex-direction:column;justify-content:center;gap:1rem;padding:2rem}
.s-${id} .track.is-animated .panel{flex:0 0 ${100 / n}%;width:${100 / n}%}
.s-${id} .num{color:var(--accent);font-family:var(--font-display);font-size:1rem;letter-spacing:.2em}
.s-${id} .panel-title{font-size:clamp(2rem,5vw,3.5rem);max-width:16ch}
.s-${id} .panel-body{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem);max-width:560px}`,
    js: `var track = root.querySelector('.track');
track.classList.add('is-animated');
gsap.to(track, {
  xPercent: -(100 * (${n} - 1) / ${n}), ease: 'none',
  scrollTrigger: { trigger: root, pin: root, scrub: 1, anticipatePin: 1,
    start: 'top top', end: '+=' + (${n} * 100) + '%' }
});`,
  }
}
