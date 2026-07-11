import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { ctaButton, eyebrow, subheadline } from './shared'
import { esc } from './shared'

/* Headline splits and reveals per word/line/char behind a clip (split-text-reveal). */
export const splitTextRevealSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const unit = String(params.unit ?? 'words')
  const stagger = Number(params.stagger ?? 0.06)
  const rotate = Number(params.rotate ?? 0)
  const tag = id === 'hero' ? 'h1' : 'h2'
  const setRotate = rotate > 0 ? `, rotate: ${rotate}` : ''

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner">
    ${eyebrow(copy)}
    <${tag} class="headline">${esc(copy.headline)}</${tag}>
    ${copy.subheadline ? `<div class="fade">${subheadline(copy)}</div>` : ''}
    ${copy.cta ? `<div class="fade">${ctaButton(copy)}</div>` : ''}
  </div>
</section>`,
    css: `.s-${id}{${id === 'hero' ? 'min-height:100vh;display:flex;align-items:center' : ''}}
.s-${id} .inner{display:flex;flex-direction:column;gap:1.5rem;max-width:960px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.5rem,7vw,${id === 'hero' ? '5.5rem' : '4rem'});overflow:hidden;padding-bottom:.1em}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.35rem);max-width:640px}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}`,
    js: `var split = new SplitText(root.querySelector('.headline'), { type: '${unit}' });
var pieces = split.${unit};
gsap.set(pieces, { yPercent: 120, autoAlpha: 0${setRotate} });
var fades = root.querySelectorAll('.fade');
gsap.set(fades, { y: 24, autoAlpha: 0 });
function play() {
  var tl = gsap.timeline();
  tl.to(pieces, { yPercent: 0, autoAlpha: 1, rotate: 0, duration: 0.8, stagger: ${stagger}, ease: 'power4.out' })
    .to(fades, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, '-=0.4');
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }`,
  }
}
