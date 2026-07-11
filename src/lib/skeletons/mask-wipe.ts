import type { SectionModule } from '../schema'
import { maskWipeHiddenInset, type SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, subheadline } from './shared'

/* Media/panel revealed by an animated clip-path wipe (mask-wipe). */

export const maskWipeSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const direction = String(params.direction ?? 'up')
  const duration = Number(params.duration ?? 1.0)
  const tag = id === 'hero' ? 'h1' : 'h2'

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner">
    <div class="copy">
      ${eyebrow(copy)}
      ${headline(copy, tag)}
      ${subheadline(copy)}
      ${bodyText(copy)}
      ${ctaButton(copy)}
    </div>
    <div class="panel" aria-hidden="true"></div>
  </div>
</section>`,
    css: `.s-${id}{${id === 'hero' ? 'min-height:100vh;display:flex;align-items:center' : ''}}
.s-${id} .inner{display:grid;grid-template-columns:1.1fr 1fr;gap:2.5rem;align-items:center;max-width:1100px}
.s-${id} .copy{display:flex;flex-direction:column;gap:1.1rem}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.25rem,5vw,${id === 'hero' ? '4.5rem' : '3.25rem'})}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem)}
.s-${id} .body{color:var(--muted)}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}
.s-${id} .panel{aspect-ratio:4/3;border-radius:var(--radius);background:linear-gradient(135deg,var(--accent),var(--surface))}
@media (max-width:720px){.s-${id} .inner{grid-template-columns:1fr}.s-${id} .panel{order:-1}}`,
    js: `var panel = root.querySelector('.panel');
gsap.set(panel, { clipPath: '${maskWipeHiddenInset(direction)}' });
function play() {
  gsap.to(panel, { clipPath: 'inset(0% 0% 0% 0%)', duration: ${duration}, ease: 'power4.out' });
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }`,
  }
}
