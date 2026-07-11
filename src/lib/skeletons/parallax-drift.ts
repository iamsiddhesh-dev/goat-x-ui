import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { bodyText, eyebrow, headline, subheadline } from './shared'

/* Layers translate vertically at different rates on scrub (parallax-drift). */
export const parallaxDriftSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const intensity = String(params.intensity ?? 'medium')
  const base = intensity === 'subtle' ? 8 : intensity === 'strong' ? 24 : 15

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="blob layer" aria-hidden="true"></div>
  <div class="container inner">
    <div class="layer copy">
      ${eyebrow(copy)}
      ${headline(copy)}
      ${subheadline(copy)}
      ${bodyText(copy)}
    </div>
  </div>
</section>`,
    css: `.s-${id}{position:relative;overflow:hidden;min-height:80vh;display:flex;align-items:center}
.s-${id} .inner{position:relative;z-index:1;max-width:820px}
.s-${id} .copy{display:flex;flex-direction:column;gap:1.1rem}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.25rem,6vw,4rem)}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.3rem);max-width:600px}
.s-${id} .body{color:var(--muted);max-width:600px}
.s-${id} .blob{position:absolute;top:-15%;right:-10%;width:60vw;height:60vw;max-width:700px;max-height:700px;border-radius:50%;background:radial-gradient(circle at 30% 30%,var(--accent),transparent 62%);opacity:.28;filter:blur(10px);z-index:0}`,
    js: `var blob = root.querySelector('.blob');
gsap.to(blob, { yPercent: -${base * 2}, ease: 'none',
  scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });
var copy = root.querySelector('.copy');
gsap.to(copy, { yPercent: -${base}, ease: 'none',
  scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });`,
  }
}
