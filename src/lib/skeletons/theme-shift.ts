import type { SectionModule } from '../schema'
import { themeShiftTargetExpr, type SectionSkeletonFn } from '../vocabulary'
import { bodyText, ctaButton, eyebrow, headline, subheadline } from './shared'

/* Section's own background crossfades to a theme color while in view, reversing on leave-back (theme-shift). */
export const themeShiftSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const bg = String(params.bg ?? 'surface')

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container inner">
    ${eyebrow(copy)}
    ${headline(copy)}
    ${subheadline(copy)}
    ${bodyText(copy)}
    ${ctaButton(copy)}
  </div>
</section>`,
    css: `.s-${id}{min-height:100vh;display:flex;align-items:center}
.s-${id} .inner{display:flex;flex-direction:column;gap:1.1rem;max-width:820px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(2.25rem,6vw,3.5rem)}
.s-${id} .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.3rem);max-width:640px}
.s-${id} .body{color:var(--muted);max-width:640px}
.s-${id} .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-${id} .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-${id} .cta-sub{color:var(--muted);font-size:.85rem}`,
    js: `var target = ${themeShiftTargetExpr(bg)};
gsap.to(root, {
  backgroundColor: target, duration: 0.6, ease: 'power2.inOut',
  scrollTrigger: { trigger: root, start: 'top center', end: 'bottom center',
    toggleActions: 'play none none reverse' }
});`,
  }
}
