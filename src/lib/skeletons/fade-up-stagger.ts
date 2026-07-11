import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, itemCards, subheadline } from './shared'

/* Children rise + fade in sequence on enter (intent: fade-up-stagger). */
export const fadeUpStaggerSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const distance = Number(params.distance ?? 40)
  const stagger = Number(params.stagger ?? 0.08)
  const duration = Number(params.duration ?? 0.7)
  const tag = id === 'hero' ? 'h1' : 'h2'

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner">
    <div class="reveal">${eyebrow(copy) || '&nbsp;'}</div>
    <div class="reveal">${headline(copy, tag)}</div>
    ${copy.subheadline ? `<div class="reveal">${subheadline(copy)}</div>` : ''}
    ${copy.body ? `<div class="reveal">${bodyText(copy)}</div>` : ''}
    ${copy.items ? `<div class="grid">
      ${itemCards(copy, 'reveal')}
    </div>` : ''}
    ${copy.cta ? `<div class="reveal">${ctaButton(copy)}</div>` : ''}
  </div>
</section>`,
    css: `.s-${id}{${id === 'hero' ? 'min-height:100vh;display:flex;align-items:center' : ''}}
.s-${id} .inner{display:flex;flex-direction:column;gap:1.25rem;max-width:900px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.25rem,6vw,${id === 'hero' ? '5rem' : '3.5rem'})}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.3rem);max-width:640px}
.s-${id} .body{color:var(--muted);max-width:640px}
.s-${id} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.s-${id} .item{background:var(--surface);border-radius:var(--radius);padding:1.25rem}
.s-${id} .item-title{font-size:1.1rem}
.s-${id} .item-body{color:var(--muted);margin-top:.4rem;font-size:.95rem}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}
@media (max-width:640px){.s-${id} .grid{grid-template-columns:1fr}}`,
    js: `var els = root.querySelectorAll('.reveal');
gsap.set(els, { y: ${distance}, autoAlpha: 0 });
function play() {
  gsap.to(els, { y: 0, autoAlpha: 1, duration: ${duration}, stagger: ${stagger}, ease: 'power3.out' });
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }`,
  }
}
