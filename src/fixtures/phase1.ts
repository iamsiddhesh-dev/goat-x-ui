import type { SectionModule, ThemeTokens } from '../lib/schema'

/* ============================================================================
 * Phase 1 fixtures (AGENT_SPEC §8, Phase 1).
 *
 * Hand-written SectionModules used to prove the runtime harness + assembler
 * before any LLM exists:
 *   - `heroModule`      : fade-up-stagger (entrance, once)
 *   - `showcaseModule`  : pinned-step-sequence (pin + scrub)
 *   - `brokenModule`    : deliberately throws inside init, to exercise the
 *                         harness error bridge (postMessage -> parent).
 *
 * Both real modules obey rule C9: every hidden/offset initial state lives in
 * JS (gsap.set), so if init is skipped (reduced-motion), the page is a complete,
 * fully-readable static document. The pinned section additionally degrades its
 * layout: steps flow vertically until JS opts them into the absolute stack via
 * an `.is-animated` class, so no-JS never overlaps content.
 * ========================================================================== */

export const theme: ThemeTokens = {
  mode: 'dark',
  colors: {
    bg: '#0a0a0b',
    surface: '#141416',
    text: '#f2f2ef',
    muted: '#8a8a86',
    accent: '#c8ff4d',
    accentContrast: '#0a0a0b',
  },
  fonts: { display: 'Space Grotesk', body: 'Inter' },
  radius: 6,
}

export const meta = {
  title: 'Vibely — Phase 1 harness',
  description: 'Hand-written section modules in the fixed GSAP + Lenis runtime harness.',
}

/* -------------------------------------------------------------------------- */
/* hero — fade-up-stagger                                                     */
/* -------------------------------------------------------------------------- */

const heroModule: SectionModule = {
  id: 'hero',
  origin: 'generated',
  html: `<section data-section="hero" class="s-hero">
  <div class="container hero-inner">
    <p class="eyebrow reveal">Phase 1 · runtime harness</p>
    <h1 class="reveal">Prove the animation runtime before the AI exists.</h1>
    <p class="sub reveal">Two hand-written section modules, assembled into the fixed GSAP + Lenis harness. No LLM in this loop yet — just the load-bearing scroll mechanics.</p>
    <div class="cta-row reveal">
      <a class="btn" href="#showcase">See the pinned sequence</a>
      <span class="cta-sub">Scroll to feel the smooth scroll</span>
    </div>
  </div>
</section>`,
  css: `.s-hero{min-height:100vh;display:flex;align-items:center}
.s-hero .hero-inner{display:flex;flex-direction:column;gap:1.5rem;max-width:900px}
.s-hero .eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}
.s-hero h1{font-size:clamp(2.5rem,7vw,5.5rem)}
.s-hero .sub{color:var(--muted);font-size:clamp(1rem,2vw,1.35rem);max-width:640px}
.s-hero .cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.s-hero .btn{background:var(--accent);color:var(--accent-contrast);padding:.85rem 1.5rem;border-radius:var(--radius);text-decoration:none;font-weight:600}
.s-hero .cta-sub{color:var(--muted);font-size:.85rem}`,
  js: `var els = root.querySelectorAll('.reveal');
gsap.set(els, { y: 40, autoAlpha: 0 });
function playIn() {
  gsap.to(els, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' });
}
// Play on enter for below-the-fold sections; if this section is already in view
// at load (e.g. a hero), onEnter can never fire (its start sits at a negative,
// unreachable scroll), so play immediately when the trigger is active.
var st = ScrollTrigger.create({ trigger: root, start: 'top 80%', once: true, onEnter: playIn });
if (st.isActive) { st.kill(); playIn(); }`,
}

/* -------------------------------------------------------------------------- */
/* showcase — pinned-step-sequence                                            */
/* -------------------------------------------------------------------------- */

const showcaseModule: SectionModule = {
  id: 'showcase',
  origin: 'generated',
  html: `<section data-section="showcase" class="s-showcase">
  <div class="stage">
    <article class="step">
      <span class="num">01</span>
      <h2>The section pins to the viewport</h2>
      <p>The harness owns Lenis, plugin registration and refresh. This module only declares pin: root — the load-bearing ScrollTrigger shape.</p>
    </article>
    <article class="step">
      <span class="num">02</span>
      <h2>Steps hand off on scrub</h2>
      <p>One timeline, one ScrollTrigger. Each step crossfades and slides as scroll progresses through the pinned range.</p>
    </article>
    <article class="step">
      <span class="num">03</span>
      <h2>It still degrades to static</h2>
      <p>Initial states live in JS. With motion reduced, steps flow as a readable vertical list — nothing is trapped invisible.</p>
    </article>
  </div>
</section>`,
  css: `.s-showcase{background:var(--surface)}
.s-showcase .stage{position:relative;max-width:900px;margin-inline:auto;display:flex;flex-direction:column;gap:3rem}
.s-showcase .stage.is-animated{min-height:100vh;justify-content:center}
.s-showcase .stage.is-animated .step{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1rem}
.s-showcase .step{display:flex;flex-direction:column;gap:1rem}
.s-showcase .num{color:var(--accent);font-family:var(--font-display);font-size:1rem;letter-spacing:.2em}
.s-showcase h2{font-size:clamp(2rem,5vw,3.5rem);max-width:14ch}
.s-showcase p{color:var(--muted);font-size:clamp(1rem,2vw,1.25rem);max-width:560px}`,
  js: `var stage = root.querySelector('.stage');
var steps = gsap.utils.toArray(root.querySelectorAll('.step'));
stage.classList.add('is-animated');
gsap.set(steps.slice(1), { autoAlpha: 0, yPercent: 12 });
var tl = gsap.timeline({
  scrollTrigger: {
    trigger: root, pin: root, scrub: 1, anticipatePin: 1,
    start: 'top top', end: '+=300%'
  }
});
steps.forEach(function (step, i) {
  if (i === 0) return;
  tl.to(steps[i - 1], { autoAlpha: 0, yPercent: -12, ease: 'none' })
    .to(step, { autoAlpha: 1, yPercent: 0, ease: 'none' }, '<0.2');
});`,
}

/* -------------------------------------------------------------------------- */
/* broken — deliberately throws (error-bridge test only)                      */
/* -------------------------------------------------------------------------- */

const brokenModule: SectionModule = {
  id: 'broken',
  origin: 'generated',
  html: `<section data-section="broken" class="s-broken">
  <div class="container">
    <h2>Error-bridge test section</h2>
    <p>This section's init throws on purpose. The harness catches it, isolates it, and postMessages a section-error to the app — the rest of the page keeps working.</p>
  </div>
</section>`,
  css: `.s-broken{background:var(--bg)}
.s-broken .container{display:flex;flex-direction:column;gap:1rem;max-width:760px}
.s-broken h2{font-size:clamp(1.75rem,4vw,2.75rem)}
.s-broken p{color:var(--muted);font-size:clamp(1rem,2vw,1.2rem)}`,
  js: `throw new Error('deliberate section error for postMessage test');`,
}

export const modules = { heroModule, showcaseModule, brokenModule }

/** Base page (the two real modules). */
export const baseSections: SectionModule[] = [heroModule, showcaseModule]

/** Base page + the throwing section, for exercising the error bridge. */
export const withBrokenSection: SectionModule[] = [
  heroModule,
  showcaseModule,
  brokenModule,
]
