import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { esc } from './shared'

/* Cards stack via native CSS sticky; each incoming card scales/fades the previous back (sticky-card-stack). */
export const stickyCardStackSkeleton: SectionSkeletonFn = ({
  id,
  copy,
}): SectionModule => {
  // Build real cards from copy.items; fall back to headline/sub/body if sparse.
  let cards = (copy.items ?? []).map((it, i) => ({
    num: String(i + 1).padStart(2, '0'),
    title: it.title,
    body: it.body ?? '',
  }))
  if (cards.length < 2) {
    cards = [
      { num: '01', title: copy.headline, body: copy.subheadline ?? '' },
      { num: '02', title: copy.subheadline ?? copy.headline, body: copy.body ?? '' },
    ]
  }
  const cardHtml = cards
    .map(
      (c, i) => `<div class="card-wrap">
      <article class="card" style="top:${8 + i * 2}%">
        <span class="num">${esc(c.num)}</span>
        <h2 class="card-title">${esc(c.title)}</h2>
        ${c.body ? `<p class="card-body">${esc(c.body)}</p>` : ''}
      </article>
    </div>`,
    )
    .join('\n    ')

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="stack">
    ${cardHtml}
  </div>
</section>`,
    css: `.s-${id}{background:var(--surface)}
.s-${id} .stack{display:flex;flex-direction:column}
.s-${id} .card-wrap{min-height:100vh;display:flex;align-items:flex-start}
.s-${id} .card{position:sticky;width:100%;max-width:640px;margin-inline:auto;background:var(--bg);border-radius:var(--radius);padding:2.5rem;display:flex;flex-direction:column;gap:1rem;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.s-${id} .num{color:var(--accent);font-family:var(--font-display);font-size:1rem;letter-spacing:.2em}
.s-${id} .card-title{font-size:clamp(1.75rem,4vw,2.5rem)}
.s-${id} .card-body{color:var(--muted);font-size:clamp(1rem,2vw,1.15rem)}`,
    js: `var wraps = gsap.utils.toArray(root.querySelectorAll('.card-wrap'));
var cards = wraps.map(function (w) { return w.querySelector('.card'); });
cards.forEach(function (card, i) {
  if (i === cards.length - 1) return;
  gsap.to(card, {
    scale: 0.9, autoAlpha: 0.6, ease: 'none',
    scrollTrigger: { trigger: wraps[i + 1], start: 'top bottom', end: 'top top', scrub: true }
  });
});`,
  }
}
