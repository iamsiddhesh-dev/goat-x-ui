import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { bodyText, eyebrow, headline, subheadline } from './shared'

/* Media drifts opposite parallax-drift's direction; text sits in normal flow (reverse-parallax). */
export const reverseParallaxSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const intensity = String(params.intensity ?? 'subtle')
  const drift = intensity === 'subtle' ? 8 : intensity === 'strong' ? 24 : 15

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner">
    <div class="copy">
      ${eyebrow(copy)}
      ${headline(copy)}
      ${subheadline(copy)}
      ${bodyText(copy)}
    </div>
    <div class="media" aria-hidden="true"></div>
  </div>
</section>`,
    css: `.s-${id} .inner{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;align-items:center;max-width:1100px}
.s-${id} .copy{display:flex;flex-direction:column;gap:1.1rem}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2rem,5vw,3.25rem)}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem)}
.s-${id} .body{color:var(--muted)}
.s-${id} .media{aspect-ratio:1;border-radius:var(--radius);background:linear-gradient(135deg,var(--accent),var(--surface))}
@media (max-width:720px){.s-${id} .inner{grid-template-columns:1fr}.s-${id} .media{order:-1}}`,
    js: `var media = root.querySelector('.media');
gsap.to(media, { yPercent: ${drift}, ease: 'none',
  scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });`,
  }
}
