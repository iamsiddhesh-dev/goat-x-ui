import type { SectionModule } from '../schema'
import type { ClampedParams, SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, subheadline } from './shared'

/** intensity → how far the base layer recedes while the cover slides over it. */
function receded(params: ClampedParams): { alpha: number; scale: number } {
  const intensity = String(params.intensity ?? 'medium')
  if (intensity === 'subtle') return { alpha: 0.85, scale: 0.97 }
  if (intensity === 'strong') return { alpha: 0.5, scale: 0.88 }
  return { alpha: 0.7, scale: 0.93 }
}

/* Section pins; a cover panel slides DOWN from above over the base content —
 * the inverse of the usual "next content rises from below" feel
 * (reverse-scroll-reveal). Scrolling back retracts it upward for free. */
export const reverseScrollRevealSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const { alpha, scale } = receded(params)

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="stage">
    <div class="base">
      ${eyebrow(copy)}
      ${headline(copy)}
      ${subheadline(copy)}
    </div>
    <div class="cover">
      ${bodyText(copy)}
      ${ctaButton(copy)}
    </div>
  </div>
</section>`,
    css: `.s-${id}{background:var(--surface)}
.s-${id} .stage{position:relative;max-width:900px;margin-inline:auto;display:flex;flex-direction:column;gap:2rem}
.s-${id} .stage.is-animated{min-height:100vh;justify-content:center;overflow:hidden}
.s-${id} .stage.is-animated .cover{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1.5rem;background:var(--bg)}
.s-${id} .base{display:flex;flex-direction:column;gap:1rem}
.s-${id} .cover{display:flex;flex-direction:column;gap:1.5rem;padding:clamp(1.25rem,5vw,4rem)}
.s-${id} .eyebrow{color:var(--accent);font-family:var(--font-display);font-size:.9rem;letter-spacing:.15em;text-transform:uppercase}
.s-${id} .headline{font-size:clamp(2rem,5vw,3.5rem);max-width:16ch}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem);max-width:560px}
.s-${id} .body{font-size:clamp(1.1rem,2.5vw,1.6rem);max-width:560px}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);border-radius:var(--radius);padding:.85rem 1.75rem;font-weight:600;text-decoration:none}
.s-${id} .cta-sub{color:var(--muted);font-size:.9rem}`,
    js: `var stage = root.querySelector('.stage');
var base = root.querySelector('.base');
var cover = root.querySelector('.cover');
stage.classList.add('is-animated');
gsap.set(cover, { yPercent: -100 });
var tl = gsap.timeline({
  scrollTrigger: {
    trigger: root, pin: root, scrub: 1, anticipatePin: 1,
    start: 'top top', end: '+=100%'
  }
});
tl.to(cover, { yPercent: 0, ease: 'none' }, 0)
  .to(base, { autoAlpha: ${alpha}, scale: ${scale}, ease: 'none' }, 0);`,
  }
}
