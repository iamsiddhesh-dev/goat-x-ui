import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, subheadline } from './shared'

/* A single element settles from an oversized scale to 1 with a fade (scale-settle). */
export const scaleSettleSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const from = Number(params.from ?? 1.12)
  const duration = Number(params.duration ?? 1.1)
  const tag = id === 'hero' ? 'h1' : 'h2'

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner settle">
    ${eyebrow(copy)}
    ${headline(copy, tag)}
    ${subheadline(copy)}
    ${bodyText(copy)}
    ${ctaButton(copy)}
  </div>
</section>`,
    css: `.s-${id}{${id === 'hero' ? 'min-height:100vh;display:flex;align-items:center' : ''}}
.s-${id} .inner{display:flex;flex-direction:column;gap:1.1rem;max-width:820px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.25rem,6vw,${id === 'hero' ? '5rem' : '3.5rem'})}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.3rem);max-width:640px}
.s-${id} .body{color:var(--muted);max-width:640px}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}`,
    js: `var el = root.querySelector('.settle');
gsap.set(el, { scale: ${from}, autoAlpha: 0 });
function play() {
  gsap.to(el, { scale: 1, autoAlpha: 1, duration: ${duration}, ease: 'power3.out' });
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }`,
  }
}
