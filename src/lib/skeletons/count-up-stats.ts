import type { SectionModule } from '../schema'
import type { SectionSkeletonFn } from '../vocabulary'
import { esc, eyebrow, headline, parseStatNumber } from './shared'

/* Numbers count up from 0 to target with snap rounding, once on enter (count-up-stats). */
export const countUpStatsSkeleton: SectionSkeletonFn = ({
  id,
  copy,
  params,
}): SectionModule => {
  const duration = Number(params.duration ?? 1.4)

  // Build real stats from copy.items; fall back to a couple of demo figures.
  const rawItems =
    copy.items && copy.items.length
      ? copy.items
      : [
          { title: '250+', body: 'Active users' },
          { title: '98%', body: 'Uptime' },
        ]
  const stats = rawItems.map((it) => ({
    ...parseStatNumber(it.title),
    label: it.body ?? '',
  }))

  const statHtml = stats
    .map(
      (s) => `<div class="stat">
      <span class="stat-num" data-value="${s.value}" data-prefix="${esc(s.prefix)}" data-suffix="${esc(s.suffix)}">${esc(s.prefix)}0${esc(s.suffix)}</span>
      ${s.label ? `<p class="stat-label">${esc(s.label)}</p>` : ''}
    </div>`,
    )
    .join('\n    ')

  return {
    id,
    origin: 'fallback',
    html: `<section data-section="${id}" class="s-${id}">
  <div class="container">
    ${eyebrow(copy)}
    ${copy.headline ? headline(copy) : ''}
    <div class="stats">
      ${statHtml}
    </div>
  </div>
</section>`,
    css: `.s-${id} .container{display:flex;flex-direction:column;gap:2rem;max-width:960px}
.s-${id} .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-${id} .headline{font-size:clamp(1.75rem,4vw,2.75rem)}
.s-${id} .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:2rem}
.s-${id} .stat{display:flex;flex-direction:column;gap:.4rem}
.s-${id} .stat-num{font-family:var(--font-display);font-size:clamp(2.25rem,6vw,3.5rem);color:var(--accent)}
.s-${id} .stat-label{color:var(--muted);font-size:.95rem}`,
    js: `var nums = gsap.utils.toArray(root.querySelectorAll('.stat-num'));
function play() {
  nums.forEach(function (el) {
    var value = Number(el.dataset.value);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var proxy = { val: 0 };
    gsap.to(proxy, {
      val: value, duration: ${duration}, ease: 'power1.out', snap: { val: 1 },
      onUpdate: function () { el.textContent = prefix + Math.round(proxy.val) + suffix; }
    });
  });
}
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: play });
if (st.isActive) { st.kill(); play(); }`,
  }
}
