import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { esc } from './shared'

/* Section pins; content steps hand off on scrub (pinned-step-sequence). */
export const pinnedStepSequenceSkeleton: SectionSkeletonFn = ({
  id,
  copy,
}): SectionModule => {
  // Build real steps from copy.items; fall back to headline/sub/body if sparse.
  let steps = (copy.items ?? []).map((it, i) => ({
    num: String(i + 1).padStart(2, '0'),
    title: it.title,
    body: it.body ?? '',
  }))
  if (steps.length < 2) {
    steps = [
      { num: '01', title: copy.headline, body: copy.subheadline ?? '' },
      { num: '02', title: copy.subheadline ?? copy.headline, body: copy.body ?? '' },
    ]
  }
  const n = steps.length

  const stepHtml = steps
    .map(
      (s) => `<article class="step">
      <span class="num">${esc(s.num)}</span>
      <h2 class="step-title">${esc(s.title)}</h2>
      ${s.body ? `<p class="step-body">${esc(s.body)}</p>` : ''}
    </article>`,
    )
    .join('\n    ')

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="stage">
    ${stepHtml}
  </div>
</section>`,
    css: `.s-${id}{background:var(--surface)}
.s-${id} .stage{position:relative;max-width:900px;margin-inline:auto;display:flex;flex-direction:column;gap:3rem}
.s-${id} .stage.is-animated{min-height:100vh;justify-content:center}
.s-${id} .stage.is-animated .step{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1rem}
.s-${id} .step{display:flex;flex-direction:column;gap:1rem}
.s-${id} .num{color:var(--accent);font-family:var(--font-display);font-size:1rem;letter-spacing:.2em}
.s-${id} .step-title{font-size:clamp(2rem,5vw,3.5rem);max-width:16ch}
.s-${id} .step-body{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem);max-width:560px}`,
    js: `var stage = root.querySelector('.stage');
var steps = gsap.utils.toArray(root.querySelectorAll('.step'));
stage.classList.add('is-animated');
gsap.set(steps.slice(1), { autoAlpha: 0, yPercent: 12 });
var tl = gsap.timeline({
  scrollTrigger: {
    trigger: root, pin: root, scrub: 1, anticipatePin: 1,
    start: 'top top', end: '+=' + (${n} * 100) + '%'
  }
});
steps.forEach(function (step, i) {
  if (i === 0) return;
  tl.to(steps[i - 1], { autoAlpha: 0, yPercent: -12, ease: 'none' })
    .to(step, { autoAlpha: 1, yPercent: 0, ease: 'none' }, '<0.2');
});`,
  }
}
