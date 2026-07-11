# GOAT-X-UI — Agent System Spec

**What this is:** Implementation spec for an AI agent that generates premium, animation-heavy landing pages (GSAP ScrollTrigger + Lenis) from a text prompt. No pre-built section templates — the agent writes real animation code per request, constrained by a controlled animation vocabulary.

**Stack (fixed):** TanStack Start (TypeScript, single full-stack app), Gemini REST API running `gemini-3-flash-preview`, sandboxed iframe preview, single-file HTML export. Portfolio/demo scope: favor buildable over bulletproof. Validation: Zod.

**How to read this doc:** Sections 1–3 are the architecture (pipeline, runtime harness, data contracts). Section 4 is the animation vocabulary — the heart of the system. Section 5 is the prompt templates. Section 6 is validation and failure handling. Section 7 is app wiring. Section 8 is the build order. Implement phase by phase per Section 8.

---

## 1. Agent Pipeline

### 1.1 The pipeline

```
user prompt
   │
   ▼
┌─────────────┐   PageBlueprint          ┌──────────────┐   CopyDoc
│ 1. PLANNER  │ ───────────────────────▶ │ 2. COPYWRITER│ ─────────────┐
│ (LLM, 1×)   │   sections, theme,       │  (LLM, 1×)   │              │
└─────────────┘   animation intents      └──────────────┘              │
                                                                       ▼
                                          ┌─────────────────────────────────┐
                                          │ 3. SECTION CODE GENERATOR       │
                                          │ (LLM, N parallel calls,         │
                                          │  one per section)               │
                                          └─────────────────────────────────┘
                                                                       │ SectionModule × N
                                                                       ▼
                                          ┌─────────────────────────────────┐
                                          │ 4. VALIDATOR + REPAIR           │
                                          │ (deterministic checks;          │
                                          │  ≤1 LLM repair call/section;    │
                                          │  fallback skeleton on 2nd fail) │
                                          └─────────────────────────────────┘
                                                                       │ validated SectionModule × N
                                                                       ▼
                                          ┌─────────────────────────────────┐
                                          │ 5. ASSEMBLER (deterministic,    │
                                          │  no LLM) — injects sections     │
                                          │  into the fixed runtime harness │
                                          └─────────────────────────────────┘
                                                                       │ single HTML document
                                                                       ▼
                                          ┌─────────────────────────────────┐
                                          │ 6. PREVIEW / EXPORT             │
                                          │  sandboxed iframe + error       │
                                          │  bridge; export = .html download│
                                          └─────────────────────────────────┘
```

### 1.2 How this differs from the stub (`Planner → Copywriter → Code Generator → Assembler → Preview`) and why

The stub's shape is right; four changes make it actually work:

1. **The Planner also produces the theme.** Design tokens (palette, fonts, radius, mode) must be decided once, globally, before any section is generated — otherwise N independently-generated sections drift visually. Folding this into the Planner (rather than a separate "Art Director" stage) saves a round-trip; the Planner is already making tone/direction decisions and one 70B call handles both fine.

2. **Code generation is per-section, in parallel — not one call.** Gemini 3 Flash produces reliable code at ~1–2k output tokens and degrades sharply beyond that. A full page in one call (~6–10k tokens of HTML/CSS/JS) will be truncated, inconsistent, or subtly broken. One call per section keeps each output small, lets Gemini's speed shine (N parallel calls ≈ latency of one), isolates failures (one broken section doesn't sink the page), and enables the killer demo feature: **regenerate a single section** without touching the rest.

3. **A Validator/Repair gate exists as its own stage.** Every LLM stage self-validates (Section 6), but generated *code* needs a dedicated gate: parse check, contract lint, then one repair call with the error message, then a deterministic fallback. This stage is mostly deterministic code, not LLM.

4. **The Assembler is deterministic and owns a fixed runtime harness.** This is the single most important robustness decision in the system — see Section 2. Generated code never initializes Lenis, never wires ScrollTrigger to the scroller, never calls `ScrollTrigger.refresh()`. The whole class of "smooth-scroll integration is subtly broken" bugs is removed by never letting the model write that code.

**Rejected alternatives, for the record:**
- *Separate "brief normalizer" stage* (extract industry/audience/vibe from raw prompt): folded into the Planner prompt. Not worth a round-trip at demo scale.
- *Copywriter before Planner:* no — copy depends on section structure. But Copywriter must run **before** codegen, because animation code depends on real copy (a `split-text-reveal` on a 3-word headline vs. a 9-word headline is choreographed differently; the code generator needs the actual text in the DOM it writes).
- *Runtime screenshot/scroll QA stage (agent looks at the render):* out of scope for demo. The iframe error bridge (Section 7.4) gives 80% of the value — runtime *errors* are caught and trigger fallback; aesthetic judgment is left to the human + regenerate button.

### 1.3 Orchestration model

**Client-orchestrated.** Each stage is its own TanStack Start server function; the client calls them in sequence and holds pipeline state. Rationale: free per-stage progress UI ("Planning… ✓ Writing copy… ✓ Generating hero…"), free per-stage retry, free single-section regeneration, and no need for SSE/streaming infra. A single monolithic server function would be simpler to call but makes progress reporting and partial retries painful. (Trust boundary is a non-issue: this is a demo; the Gemini key stays server-side in the server functions.)

LLM call budget for a typical 6-section page: 1 (plan) + 1 (copy) + 6 (codegen) + 0–2 (repairs) ≈ **8–10 calls**, all small. On Gemini this is a ~15–30 s end-to-end generation.

---

## 2. The Runtime Harness (fixed, never generated)

Every generated page is assembled into this exact shell. The model generates section *modules*; the harness provides everything else. **Implement this first (Phase 1) — it de-risks the entire animation runtime with zero LLM involvement.**

### 2.1 HTML shell (assembler template)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{meta.title}}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family={{fonts.display}}&family={{fonts.body}}&display=swap" rel="stylesheet" />
  <style>
    /* -- reset + tokens (fixed) -- */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-font-smoothing:antialiased}
    img,svg,video{display:block;max-width:100%}
    :root{
      --bg:{{theme.colors.bg}}; --surface:{{theme.colors.surface}};
      --text:{{theme.colors.text}}; --muted:{{theme.colors.muted}};
      --accent:{{theme.colors.accent}}; --accent-contrast:{{theme.colors.accentContrast}};
      --font-display:'{{fonts.displayName}}',sans-serif;
      --font-body:'{{fonts.bodyName}}',sans-serif;
      --radius:{{theme.radius}}px;
      --space:clamp(4rem, 10vw, 9rem); /* standard inter-section rhythm */
    }
    body{background:var(--bg);color:var(--text);font-family:var(--font-body);overflow-x:hidden}
    h1,h2,h3{font-family:var(--font-display);line-height:1.05;letter-spacing:-0.02em}
    section[data-section]{position:relative;padding:var(--space) clamp(1.25rem,5vw,4rem)}
    .container{max-width:1200px;margin-inline:auto}
    /* -- per-section CSS injected below, each block auto-prefixed -- */
    {{sectionsCss}}
  </style>
</head>
<body>
  <main id="page">
    {{sectionsHtml}}
  </main>

  <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.min.js"></script>

  <script>
  /* ============ RUNTIME HARNESS (fixed, never LLM-generated) ============ */
  (function () {
    gsap.registerPlugin(ScrollTrigger, SplitText);

    // -- error bridge: report to parent (preview app) --
    function report(type, payload) {
      try { parent.postMessage(Object.assign({ source: 'goatx', type: type }, payload), '*'); } catch (e) {}
    }
    window.addEventListener('error', function (e) {
      report('page-error', { message: String(e.message), line: e.lineno });
    });

    // -- Lenis + ScrollTrigger integration (canonical wiring) --
    var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    // -- section registry --
    var inits = [];
    window.__registerSection = function (id, fn) { inits.push({ id: id, fn: fn }); };

    window.__initSections = function () {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      inits.forEach(function (entry) {
        var root = document.querySelector('[data-section="' + entry.id + '"]');
        if (!root) { report('section-error', { id: entry.id, message: 'root not found' }); return; }
        if (reduced) return; // all hidden-states live in JS (rule C9) → skipping init = fully visible static page
        try {
          // gsap.context scopes selector-text inside tweens to `root` automatically
          gsap.context(function () { entry.fn(root); }, root);
        } catch (err) {
          report('section-error', { id: entry.id, message: String(err && err.message || err) });
        }
      });
      report('sections-ready', { count: inits.length });
    };
  })();
  </script>

  <script>
  /* ============ GENERATED SECTION MODULES ============ */
  {{sectionsJs}}
  </script>

  <script>
  document.fonts.ready.then(function () {
    window.__initSections();
    ScrollTrigger.refresh();
  });
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  </script>
</body>
</html>
```

Each generated section's JS is injected as:

```js
window.__registerSection('hero', function (root) {
/* --- generated js body for section "hero" --- */
});
```

### 2.2 What the harness guarantees (and generated code must never do)

| Concern | Owner | Generated code |
|---|---|---|
| Lenis creation + `ScrollTrigger.update` wiring + `gsap.ticker` raf loop | Harness | **Never** touches Lenis |
| `gsap.registerPlugin(...)` | Harness | Never calls it |
| `ScrollTrigger.refresh()` (fonts ready, window load) | Harness | Never calls it |
| Selector scoping via `gsap.context(fn, root)` | Harness | Uses plain selector strings in tweens (auto-scoped) or `root.querySelector(...)` |
| Error capture + postMessage to parent | Harness | Nothing |
| `prefers-reduced-motion` (skip all inits) | Harness | Nothing — but must obey rule C9 (Section 4.4) so the static page is complete |
| Fonts, reset CSS, theme CSS variables, section vertical rhythm | Harness | Consumes `var(--accent)` etc.; never redefines tokens |

Note GSAP 3.13+ is fully free including SplitText (post-Webflow-acquisition licensing) — the vocabulary can rely on SplitText from the public CDN.

---

## 3. Data Contracts (Zod — single source of truth in `src/lib/schema.ts`)

Every arrow in the pipeline diagram carries exactly one of these shapes. All schemas are `strict()` where practical; extra keys from the LLM are stripped, not fatal.

```ts
import { z } from 'zod';

/* ---------- shared ---------- */

// Slugs double as DOM ids: [a-z0-9-], unique per page.
export const SectionId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(24);

export const SectionKind = z.enum([
  'hero', 'logos', 'feature-grid', 'showcase', 'process',
  'stats', 'testimonial', 'pricing', 'faq', 'cta', 'footer',
]);

/* ---------- theme (Planner output) ---------- */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ThemeTokens = z.object({
  mode: z.enum(['dark', 'light']),                  // required — drives contrast choices downstream
  colors: z.object({
    bg: hex, surface: hex, text: hex, muted: hex,
    accent: hex, accentContrast: hex,               // accentContrast = text color usable ON accent
  }),
  fonts: z.object({
    // must come from the whitelist below; Planner prompt embeds the list
    display: z.string(),                            // e.g. "Space Grotesk"
    body: z.string(),                               // e.g. "Inter"
  }),
  radius: z.number().int().min(0).max(32),          // px, global corner radius
});

// FONT_WHITELIST (embed in Planner prompt; assembler builds the Google Fonts URL from it):
// display: Space Grotesk, Sora, Clash-alike → Archivo, Syne, Unbounded, Instrument Serif, Playfair Display, Bricolage Grotesque
// body:    Inter, Manrope, DM Sans, Figtree, IBM Plex Sans

/* ---------- animation spec (Planner output, per section) ---------- */

export const AnimationIntentId = z.enum([
  'none', 'fade-up-stagger', 'split-text-reveal', 'mask-wipe', 'scale-settle',
  'parallax-drift', 'reverse-parallax', 'scrub-choreography',
  'horizontal-scroll-track', 'pinned-step-sequence', 'sticky-card-stack',
  'marquee-loop', 'count-up-stats', 'theme-shift',
]);

export const AnimationSpec = z.object({
  intent: AnimationIntentId,
  // Free-form param bag; validated + CLAMPED per-intent by the vocabulary layer (Section 4.3).
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  // One sentence of creative direction the Code Generator may use ("panels feel like film frames").
  note: z.string().max(200).optional(),
});

/* ---------- Planner output ---------- */

export const SectionPlan = z.object({
  id: SectionId,
  kind: SectionKind,
  // What this section communicates — the Copywriter's brief for it. 1–2 sentences.
  contentBrief: z.string().min(10).max(300),
  // Optional layout nudge for the Code Generator ("two columns, media right", "full-bleed").
  layoutHint: z.string().max(120).optional(),
  animation: AnimationSpec,
});

export const PageBlueprint = z.object({
  meta: z.object({
    title: z.string().max(70),
    description: z.string().max(160),
  }),
  // Voice for the Copywriter: 2–4 adjectives + a register note.
  tone: z.string().min(3).max(160),
  theme: ThemeTokens,
  sections: z.array(SectionPlan).min(3).max(8),
});
// Post-parse invariants (checked in code, not Zod): unique section ids;
// composition rules R1–R6 (Section 4.2) — violations are auto-corrected, not rejected.

/* ---------- Copywriter output ---------- */

// One uniform copy shape covers all section kinds; unused fields are omitted.
export const SectionCopy = z.object({
  id: SectionId,                                    // must match a blueprint section
  eyebrow: z.string().max(40).optional(),           // small kicker above headline
  headline: z.string().min(2).max(90),              // REQUIRED for every section
  subheadline: z.string().max(180).optional(),
  body: z.string().max(400).optional(),
  items: z.array(z.object({                         // features, steps, cards, FAQs, logos…
    title: z.string().max(60),
    body: z.string().max(200).optional(),
  })).max(8).optional(),
  stats: z.array(z.object({                         // required if intent === 'count-up-stats'
    value: z.string().max(12),                      // "4.9", "12k+", "99.99%" — string, codegen parses digits
    label: z.string().max(40),
  })).max(4).optional(),
  cta: z.object({
    label: z.string().max(30),
    sub: z.string().max(60).optional(),             // reassurance line ("No credit card required")
  }).optional(),
});

export const CopyDoc = z.object({
  sections: z.array(SectionCopy),
});
// Post-parse: reconcile against blueprint by id — see failure F4 (Section 6).

/* ---------- Code Generator output (per section) ---------- */

// NOTE: the codegen LLM does NOT emit JSON (Section 5.3 explains why).
// It emits delimited blocks; the server parses them into this shape.
export const SectionModule = z.object({
  id: SectionId,
  html: z.string().min(20),   // exactly one root: <section data-section="{id}" class="s-{id}">…</section>
  css: z.string().default(''),// will be auto-prefixed with [data-section="{id}"] by the validator
  js: z.string().min(10),     // BODY of function (root) { … } — statements only, no wrapper
  // provenance for the UI:
  origin: z.enum(['generated', 'repaired', 'fallback']).default('generated'),
});

/* ---------- assembled result + pipeline state ---------- */

export const PageBundle = z.object({
  blueprint: PageBlueprint,
  copy: CopyDoc,
  sections: z.array(SectionModule),
  html: z.string(),                                 // full assembled document
  warnings: z.array(z.string()),                    // clamps, fallbacks, reconciliations — surfaced in UI
});

export const StageStatus = z.enum(['idle', 'running', 'done', 'error']);
export const PipelineState = z.object({             // client-side store shape
  prompt: z.string(),
  planner: StageStatus, copywriter: StageStatus,
  sections: z.record(z.string(), StageStatus),      // per section id
  bundle: PageBundle.partial().optional(),
});
```

**Required vs. optional, summarized:** everything the Assembler string-interpolates is required (`theme.*`, `meta.*`, `section.id`, `copy.headline`, `module.html/js`). Everything that's creative nuance is optional with safe defaults (`note`, `layoutHint`, `eyebrow`, `css`). Optionality lives at the leaves, never at the structural level — a missing optional field can never change the *shape* of what downstream stages iterate over.

---

## 4. Animation Vocabulary / Constraint Layer

### 4.1 Design position: closed vocabulary, open choreography

Three layers of constraint, loosening as you go down:

1. **Closed intent set** (hard): the Planner picks from exactly 14 intents. It cannot invent "spiral-morph-explosion." This is what keeps the Planner's creativity inside known-good ScrollTrigger patterns.
2. **Clamped parameters** (hard): each intent has a params schema with numeric ranges. Out-of-range values are **clamped, not rejected** — a Planner that asks for `stagger: 0.9` gets `0.15` and a warning, not a failed run.
3. **Structural code rules** (hard, lintable): the contract in 4.4 — scoping, property whitelist, ease whitelist, trigger rules. Checked by the Validator.

Inside those walls, the Code Generator is genuinely free: it invents the DOM structure, the CSS layout, which elements participate in the animation, the timeline composition, overlaps, and offsets. Two runs of `pinned-step-sequence` on different briefs should produce visibly different sections that share only a scroll-mechanical skeleton.

**Why this tightness level:**
- *Looser (open-ended codegen) fails empirically:* the failure surface of ScrollTrigger is narrow but deep — pin spacing math, nested pins, scroller-proxy conflicts with Lenis, refresh ordering, non-resetting `.set()` calls. A 70B model reliably gets the *vibe* of GSAP code right and these five things wrong. The intent set exists precisely to fence off those five things: pins only happen inside the two intents whose reference skeletons handle them correctly, Lenis wiring is unreachable (harness-owned), refresh is unreachable.
- *Tighter (parameterized templates) defeats the project:* if the generator fills slots in fixed markup, every "pinned reveal" looks identical and the honest description of the system becomes "template picker." The portfolio value is that the code is authored per request.
- The **reference skeletons** (4.5) thread this needle: each intent ships a minimal known-good implementation that appears in the codegen prompt as *an example of the mechanics, explicitly not a template to fill* — the model is instructed to keep the ScrollTrigger configuration shape and re-invent everything else.

### 4.2 The vocabulary catalog

Legend — **Scroll:** `once` = play on enter · `scrub` = tied to scroll position · `pin` = pins the section · `ambient` = time-based, no ScrollTrigger.

| # | Intent id | Category | Scroll | What it looks like | Params (name: range · default) |
|---|---|---|---|---|---|
| 0 | `none` | — | — | Static section, no JS | — |
| 1 | `fade-up-stagger` | entrance | once | Children rise + fade in sequence | `distance`: 24–80px · 40 · `stagger`: 0.06–0.15s · 0.08 · `duration`: 0.5–1.0s · 0.7 |
| 2 | `split-text-reveal` | entrance | once | Headline splits (SplitText) and reveals per word/line/char with y-offset behind a clip | `unit`: words\|lines\|chars · words · `stagger`: 0.02–0.12s · 0.06 · `rotate`: 0–8deg · 0 |
| 3 | `mask-wipe` | entrance | once | Media/panel revealed by animated `clip-path: inset()` wipe | `direction`: up\|down\|left\|right · up · `duration`: 0.8–1.4s · 1.0 |
| 4 | `scale-settle` | entrance | once | Element settles from scale 1.06–1.2 → 1 with fade | `from`: 1.06–1.2 · 1.12 · `duration`: 0.8–1.6s · 1.1 |
| 5 | `parallax-drift` | scroll-linked | scrub | 2–4 layers translate vertically at different rates as section transits viewport | `intensity`: subtle\|medium\|strong · medium · `layers`: 2–4 · 3 |
| 6 | `reverse-parallax` | scroll-linked | scrub | Media drifts against scroll direction while text flows normally | `intensity`: subtle\|medium\|strong · subtle |
| 7 | `scrub-choreography` | scroll-linked | scrub | Free-form timeline (transform/opacity only) scrubbed across the section's viewport transit — the most open intent | `smoothing`: 0.5–1.5 · 1 (ScrollTrigger `scrub` value) |
| 8 | `horizontal-scroll-track` | pinned | pin+scrub | Section pins; inner track translates X through panels | `panels`: 2–5 · 3 |
| 9 | `pinned-step-sequence` | pinned | pin+scrub | Section pins; 2–4 content steps crossfade/slide as scroll progresses | `steps`: 2–4 · 3 |
| 10 | `sticky-card-stack` | scroll-linked | scrub (CSS sticky, **no GSAP pin**) | Cards stack; each incoming card pushes the previous back (scale/fade) | `cards`: 2–5 · 3 |
| 11 | `marquee-loop` | ambient | ambient | Infinite horizontal marquee (logos, keywords) | `speedSec`: 15–40 · 24 · `direction`: left\|right · left |
| 12 | `count-up-stats` | entrance | once | Numbers count up with snap on enter | `duration`: 1–2s · 1.4 |
| 13 | `theme-shift` | global | once (toggle) | Page background crossfades to a different token color while this section is in view (reverses on leave-back) | `bg`: 'surface'\|'accent'\|hex · surface |

Fourteen intents is deliberate: small enough to write a contract card + reference skeleton for each (a bounded, finishable task), large enough that a 6-section page has real combinatorial variety (≈10⁶ intent-assignments before params and layout even enter).

### 4.3 Per-intent param clamping

Implement as a table in `src/lib/vocabulary.ts`:

```ts
export interface IntentDef {
  id: AnimationIntentId;
  category: 'entrance' | 'scroll-linked' | 'pinned' | 'ambient' | 'global';
  params: Record<string, ParamDef>;   // ParamDef = numeric {min,max,default} | enum {values,default}
  contractCard: string;               // markdown injected into the codegen prompt (4.5)
  fallbackSkeleton: SectionSkeletonFn;// deterministic (copy, theme) => SectionModule — the known-good version
}

export function clampParams(spec: AnimationSpec): { params: ClampedParams; warnings: string[] }
// numeric: clamp to [min,max]; enum: invalid → default; unknown keys: dropped; missing: default.
// NEVER throws. Every correction appends a human-readable warning.
```

`clampParams` runs immediately after the Planner stage, so the Copywriter and Code Generator only ever see legal params.

### 4.4 The codegen contract (hard rules, lint-checked where possible)

These appear verbatim in every Code Generator prompt, and the Validator enforces the ✓-marked ones mechanically:

| # | Rule | Lintable |
|---|---|---|
| C1 | All DOM access via the provided `root` (`root.querySelector`) or plain selector strings inside GSAP calls (auto-scoped by `gsap.context`). **Forbidden tokens:** `document.`, `window.`, `parent.`, `fetch(`, `XMLHttpRequest`, `import`, `eval(`, `localStorage`, `setTimeout(`, `setInterval(`, `innerHTML =` | ✓ regex |
| C2 | Animate **only**: transform channels (`x,y,xPercent,yPercent,scale,scaleX,scaleY,rotate,rotation,skewX`), `opacity`/`autoAlpha`, `clipPath`, and `backgroundColor` (theme-shift only). Never `top/left/width/height/margin/padding/fontSize`. | ✓ regex on tween vars |
| C3 | Eases from whitelist: `power1–power4` (`.out`/`.inOut`), `expo.out`, `sine.out`/`sine.inOut`, `back.out(1.2–2)`, `none`. Scrubbed tweens use `none` unless the contract card says otherwise. No `bounce`, no `elastic`. | ✓ regex |
| C4 | Every `ScrollTrigger` sets `trigger:` to `root` or a descendant. Entrance intents use `once: true`. Only pin-category intents may set `pin:`, and only `pin: root` (never an inner element), always with `anticipatePin: 1`. Never nest a pinned trigger inside another. | ✓ AST/regex |
| C5 | Never reference `Lenis`/`lenis`, never call `ScrollTrigger.refresh/scrollerProxy/config`, never `gsap.registerPlugin`. | ✓ regex |
| C6 | `html` = exactly one root `<section data-section="{id}" class="s-{id}">`, semantic tags inside, all copy from the CopyDoc verbatim (no invented text), no `<script>`/`<style>`/`<link>`/`<img onerror>`/inline `on*=` handlers. Visuals prefer CSS (gradients, shapes, borders) over images; if an image is essential use `https://picsum.photos/seed/{anything}/1200/800`. | ✓ parse |
| C7 | Every CSS selector written as if prefixed with `.s-{id}` (validator auto-prefixes anyway — belt and suspenders). No `position: fixed`. `position: sticky` only for `sticky-card-stack`. | ✓ postcss |
| C8 | Size budget: html ≤ 120 lines, css ≤ 120 lines, js ≤ 80 lines. | ✓ count |
| C9 | **All initial hidden/offset states are set in JS** (`gsap.set` or `from`-tweens), never in CSS. Reason: the harness skips `init` under `prefers-reduced-motion`, and a section whose CSS hides content would then be invisible forever. | ✓ regex on CSS (`opacity:0`, `visibility:hidden`, `transform:` on animated elements → reject) |
| C10 | Layout must hold with JS disabled: no zero-height sections awaiting JS, no content positioned by tweens alone. | ✗ (prompt-only; caught indirectly by C9) |

### 4.5 Contract cards + reference skeletons

Each intent has a **contract card**: a ~30-line markdown block injected into the codegen prompt for that section only (the model never sees the other 13 — keeps the prompt small and focused). Format:

````markdown
## INTENT: pinned-step-sequence
Section pins to the viewport; N content "steps" hand off as the user scrolls.
Clamped params for this section: steps=3, (scrub smoothing fixed at 1).

MECHANICS YOU MUST KEEP (this is the load-bearing ScrollTrigger shape):
- ONE timeline, ONE ScrollTrigger: { trigger: root, pin: root, scrub: 1,
  anticipatePin: 1, start: 'top top', end: '+=' + (steps * 100) + '%' }
- Steps are absolutely positioned on top of each other inside a relatively
  positioned stage element; step 1 visible initially (via gsap.set in JS, rule C9).
- Each handoff = outgoing step animates out + incoming animates in, overlapping
  on the timeline ('<' or '-=' offsets). transform/opacity/clipPath only.

YOURS TO INVENT (do not copy the reference layout):
- What a "step" is for THIS content (image + caption? number + statement? card?)
- The handoff move: crossfade, vertical slide-over, clip-path wipe, scale-swap…
- Layout of the pinned stage, progress indicator (dots/counter/line) if any.

REFERENCE SKELETON — mechanics example ONLY. Copying its DOM or layout is a failure:
```js
const steps = gsap.utils.toArray('.step');           // auto-scoped to root
gsap.set(steps.slice(1), { autoAlpha: 0, y: 60 });
const tl = gsap.timeline({
  scrollTrigger: { trigger: root, pin: root, scrub: 1, anticipatePin: 1,
                   start: 'top top', end: '+=300%' }
});
steps.forEach((step, i) => {
  if (i === 0) return;
  tl.to(steps[i - 1], { autoAlpha: 0, y: -60, ease: 'none' })
    .to(step,        { autoAlpha: 1, y: 0,  ease: 'none' }, '<0.2');
});
```
````

The same skeleton function, executed deterministically with the section's real copy and theme, doubles as the **fallback module** when generation fails twice (Section 6, F5). Writing 14 cards + 14 skeletons is the bulk of Phase 1–2 work and is exactly where the "known-good patterns" live.

### 4.6 Composition rules (page-level, enforced on the Blueprint)

Checked (and auto-corrected, with warnings) right after the Planner stage:

- **R1** — At most **one** pin-based section per page (`horizontal-scroll-track`, `pinned-step-sequence`). At most **two** "heavy" sections total (pin-based + `sticky-card-stack` + `scrub-choreography`), and never adjacent. *Correction: demote extras to `fade-up-stagger`, keeping the earliest.*
- **R2** — Hero: entrance-category intents only (1–4). *Correction: demote to `split-text-reveal`.*
- **R3** — Footer: `none` or `fade-up-stagger` only.
- **R4** — At least ⌈n/3⌉ sections use `none` or `fade-up-stagger` — pacing; a page where everything shouts reads as junk. *Correction: demote lowest-priority offenders.*
- **R5** — `theme-shift` at most twice per page, never on adjacent sections.
- **R6** — `count-up-stats` only on a section whose kind is `stats` (its brief guarantees the Copywriter emits `stats`).
- **R7** — Section count 3–8; `hero` first; if a `footer` exists it's last.

---

## 5. Prompt Templates

Conventions: `{{double_braces}}` = interpolated at runtime. All Gemini calls use `gemini-3-flash-preview`. Planner and Copywriter use `response_format: { type: 'json_object' }` (Gemini JSON mode requires the word "JSON" in the prompt — all templates include it). Suggested settings: Planner `temperature 0.8, max_tokens 2500`; Copywriter `temperature 0.85, max_tokens 2000`; Codegen `temperature 0.45, max_tokens 3000`; Repair `temperature 0.2`.

### 5.1 Planner

```text
[SYSTEM]
You are the creative director and planner for a premium landing-page generator.
You produce award-site-caliber page plans (think Awwwards/godly.website energy):
confident type, restrained palettes, one or two bold scroll moments — never a
carnival. You respond with a single JSON object and nothing else.

[USER]
Design a landing page plan as JSON for this brief:

BRIEF: {{userPrompt}}

== ANIMATION VOCABULARY (choose intents ONLY from this table) ==
{{vocabularyTable}}   ← the catalog from §4.2, rendered compact: id · category · description · params w/ ranges

== COMPOSITION RULES ==
- 4 to 7 sections. First section kind: "hero". Last: "footer" or "cta".
- At most ONE pinned intent (horizontal-scroll-track | pinned-step-sequence) per page.
  Place it mid-page on the section with the most showable content.
- Heavy sections (pinned, sticky-card-stack, scrub-choreography): max 2, never adjacent.
- Hero uses an entrance intent (split-text-reveal, fade-up-stagger, mask-wipe, scale-settle).
- At least a third of sections use "none" or "fade-up-stagger" — pacing beats spectacle.
- count-up-stats only on a "stats" section. theme-shift: max 2, never adjacent.
- Params must respect the ranges in the vocabulary table.

== THEME RULES ==
- Pick mode "dark" unless the brief clearly wants light. Palette: bg and surface
  close in value; ONE accent used sparingly; text/muted with real contrast (WCAG AA
  against bg). All colors 6-digit hex.
- Fonts strictly from: display ∈ [{{displayFonts}}], body ∈ [{{bodyFonts}}].

== OUTPUT: a single JSON object with EXACTLY this shape ==
{
  "meta": { "title": str<=70, "description": str<=160 },
  "tone": "2-4 adjectives + register, e.g. 'confident, technical, quietly premium; short sentences'",
  "theme": { "mode": "dark|light",
             "colors": { "bg": hex, "surface": hex, "text": hex, "muted": hex,
                         "accent": hex, "accentContrast": hex },
             "fonts": { "display": str, "body": str }, "radius": int 0-32 },
  "sections": [ { "id": "kebab-slug", "kind": "<SectionKind>",
                  "contentBrief": "1-2 sentences: what this section must communicate",
                  "layoutHint": "optional, <=120 chars",
                  "animation": { "intent": "<intent-id>", "params": { ... }, "note": "optional art direction" }
                } ]
}

== EXAMPLE (different brief: "landing page for a monospace font foundry") ==
{"meta":{"title":"Grid Type — Fonts for Terminal Romantics","description":"A type foundry for monospace faces with actual personality."},
 "tone":"dry, precise, a little nerdy; short declarative sentences",
 "theme":{"mode":"dark","colors":{"bg":"#0a0a0b","surface":"#141416","text":"#f2f2ef","muted":"#8a8a86","accent":"#c8ff4d","accentContrast":"#0a0a0b"},"fonts":{"display":"Space Grotesk","body":"IBM Plex Sans"},"radius":4},
 "sections":[
  {"id":"hero","kind":"hero","contentBrief":"Foundry name and thesis: monospace fonts designed for reading, not just code.","animation":{"intent":"split-text-reveal","params":{"unit":"chars","stagger":0.03},"note":"characters land like keystrokes"}},
  {"id":"specimens","kind":"showcase","contentBrief":"Three flagship typefaces shown as large specimens with one-line personalities.","layoutHint":"full-bleed specimen rows","animation":{"intent":"pinned-step-sequence","params":{"steps":3},"note":"each specimen takes over like a slide"}},
  {"id":"features","kind":"feature-grid","contentBrief":"Ligatures, powerline glyphs, italics that don't apologize — four concrete features.","animation":{"intent":"fade-up-stagger","params":{"distance":32}}},
  {"id":"stats","kind":"stats","contentBrief":"Adoption numbers: downloads, editors supported, glyph count.","animation":{"intent":"count-up-stats","params":{}}},
  {"id":"cta","kind":"cta","contentBrief":"Try every face free for 30 days.","animation":{"intent":"fade-up-stagger","params":{}}},
  {"id":"footer","kind":"footer","contentBrief":"Minimal footer: license, contact, colophon.","animation":{"intent":"none","params":{}}}]}

Respond with JSON only. No markdown, no commentary.
```

### 5.2 Copywriter

```text
[SYSTEM]
You are a senior conversion copywriter for high-end product sites. Punchy, concrete,
zero filler. You never write "Unlock the power of", "Elevate your", "seamless",
"revolutionize", or "in today's fast-paced world". You respond with a single JSON
object and nothing else.

[USER]
Write the copy for this page as JSON.

ORIGINAL BRIEF: {{userPrompt}}
PAGE TONE: {{blueprint.tone}}
PAGE TITLE: {{blueprint.meta.title}}

SECTIONS (write copy for EVERY id, in order — same ids, no extras, none missing):
{{#each sections}}
- id: "{{id}}" · kind: {{kind}} · brief: {{contentBrief}} · animation: {{animation.intent}}
{{/each}}

== FIELD RULES ==
- Every section: "headline" (required). Others only where they earn their place.
- Headline lengths are animation-aware:
  · split-text-reveal with unit "chars": headline <= 4 words
  · split-text-reveal (words/lines): headline <= 8 words
  · everything else: headline <= 10 words
- kind "feature-grid" | "process" | "faq": 3-6 "items" [{title, body?}]. Item titles <= 6 words.
- kind "stats": 3-4 "stats" [{value, label}] — value is a short numeral string ("12k+", "99.9%").
- kind "logos": 5-8 "items" with title only (company-ish names).
- kind "cta": include "cta" {label <= 4 words, sub optional}.
- kind "footer": headline = short sign-off line; optionally 3-5 items (nav labels).
- Sentence case. No exclamation marks. No emoji.

== OUTPUT: single JSON object ==
{ "sections": [ { "id": str, "eyebrow"?: str, "headline": str, "subheadline"?: str,
                  "body"?: str, "items"?: [{"title": str, "body"?: str}],
                  "stats"?: [{"value": str, "label": str}],
                  "cta"?: {"label": str, "sub"?: str} } ] }

Respond with JSON only.
```

### 5.3 Code Generator (per section) — delimited output, NOT JSON

**Why not JSON here:** the payload *is* code. Multi-line JS/CSS inside JSON strings forces the model to escape every newline and quote; 70B-class models get this wrong often enough (~5–15% of long code outputs) that it would be the pipeline's #1 failure source. Delimited blocks are trivially parseable with a regex, immune to escaping, and let the model write code the way it saw code in training. Planner/Copywriter keep JSON mode because their payloads are data, not code.

```text
[SYSTEM]
You are an elite creative developer who hand-writes GSAP ScrollTrigger animations
for award-winning marketing sites. You write modern, minimal, intentional code.
You follow the runtime contract EXACTLY — violations are discarded by a linter.
You output exactly three delimited blocks and nothing else.

[USER]
Write ONE landing-page section: markup, scoped styles, and a GSAP init function body.

== PAGE CONTEXT ==
Tone: {{blueprint.tone}}
Theme: mode {{theme.mode}} · CSS variables ALREADY defined for you:
  var(--bg) var(--surface) var(--text) var(--muted) var(--accent) var(--accent-contrast)
  var(--font-display) var(--font-body) var(--radius)
Neighbors: previous section = {{prevKind|"(none)"}}, next = {{nextKind|"(none)"}}.

== THIS SECTION ==
id: "{{section.id}}" · kind: {{section.kind}}
layoutHint: {{section.layoutHint|"(your call)"}}
art direction: {{section.animation.note|"(none)"}}

COPY (use verbatim — every field below must appear in the HTML; invent nothing):
{{sectionCopyJson}}

== ANIMATION CONTRACT ==
{{intentContractCard}}   ← the card from §4.5 for this section's intent, params pre-clamped

== RUNTIME CONTRACT (hard rules — a linter rejects violations) ==
1. Your JS is the BODY of `function (root) { ... }`. `gsap`, `ScrollTrigger`,
   `SplitText` are globals. It runs inside gsap.context(root): bare selector
   strings in gsap calls are auto-scoped to this section. For direct DOM access
   use root.querySelector / root.querySelectorAll ONLY.
2. FORBIDDEN anywhere in JS: document. window. parent. fetch( import eval(
   setTimeout( setInterval( localStorage innerHTML Lenis ScrollTrigger.refresh
   ScrollTrigger.scrollerProxy gsap.registerPlugin
3. Animate ONLY transforms (x, y, xPercent, yPercent, scale, rotate, skewX),
   opacity/autoAlpha, clipPath. Never width/height/top/left/margin.
4. Eases: power1-4 .out/.inOut, expo.out, sine.out/.inOut, back.out(1.2-2), none.
   Scrubbed tweens: ease "none".
5. Every ScrollTrigger: trigger is root or a descendant. Entrance animations:
   once: true. Pinning (only if your contract card allows): pin: root,
   anticipatePin: 1 — never pin inner elements.
6. HTML: exactly one root element:
   <section data-section="{{section.id}}" class="s-{{section.id}}"> … </section>
   Semantic tags. No <script>, no <style>, no inline event handlers.
   Prefer CSS-built visuals (gradients, borders, shapes) over images; if an image
   is essential: https://picsum.photos/seed/{{section.id}}/1200/800
7. CSS: prefix every rule with .s-{{section.id}}. Use the CSS variables for ALL
   colors/fonts. No position:fixed. Desktop-first, must not break at 375px
   (stack columns with a media query).
8. CSS must NOT hide anything (no opacity:0 / visibility:hidden). ALL initial
   hidden/offset states are set in JS via gsap.set() at the top of your function
   — the page must be fully readable if your JS never runs.
9. Budget: HTML <= 120 lines, CSS <= 120 lines, JS <= 80 lines.

== OUTPUT FORMAT (exactly this, no commentary, no markdown fences) ==
===HTML===
<section data-section="{{section.id}}" class="s-{{section.id}}">
...
</section>
===CSS===
...
===JS===
...
===END===
```

### 5.4 Repair prompt (one retry, shared across stages)

```text
[SYSTEM]
You fix machine-rejected output. You change ONLY what the errors require and
preserve everything else. Same output format as the original task.

[USER]
Your previous output for the task below was rejected by an automated validator.

== ORIGINAL TASK ==
{{originalUserPrompt}}

== YOUR PREVIOUS OUTPUT ==
{{previousRawOutput}}

== VALIDATOR ERRORS (fix ALL of these) ==
{{#each errors}}
- {{this}}     ← e.g. "JS line 14: SyntaxError: Unexpected token ')'",
                  "forbidden token `document.` at JS line 3",
                  "JSON parse error at position 812: unterminated string"
{{/each}}

Return the FULL corrected output in the original required format. Output only that.
```

---

## 6. Failure Modes & Validation Gates

Doctrine: **every stage validates its own output before returning; every failure has a deterministic landing spot; the pipeline never hard-fails a whole page because of one section.** Max one LLM repair per artifact — after that, fall back deterministically and record a warning. (Demo scope: warnings surface in the UI as small badges, which honestly makes a *better* portfolio story than hiding them.)

| # | Failure | Stage | Detection | Handling |
|---|---|---|---|---|
| F1 | Malformed JSON (truncation, trailing commas, prose wrapper) | Planner, Copywriter | `JSON.parse` after stripping markdown fences / leading-trailing prose (grab first `{`…last `}`) | Gemini JSON mode makes this rare; on fail → 1 repair call with parse error + position → on 2nd fail, stage error surfaced to user with a "retry" button (no page-level fallback for the Planner — nothing exists yet) |
| F2 | Valid JSON, wrong shape (missing field, wrong type) | Planner, Copywriter | `zodSchema.safeParse` | Repair call with the flattened Zod error paths (human-readable: `sections[2].animation.intent: invalid enum value 'zoom-blast'`) |
| F3 | Out-of-range / unknown animation params | Planner | `clampParams` (§4.3) | **Clamp, never reject.** Warning appended |
| F4 | Copy/blueprint section mismatch (missing id, extra id, reordered) | Copywriter | Reconcile by `id` against blueprint | Extras dropped; missing sections get deterministic stub copy from `contentBrief` (headline = first clause, title-cased) + warning; order forced to blueprint order. **Never** a repair call — reconciliation is cheaper and total |
| F5 | Generated JS doesn't parse | Codegen | `new Function('root', jsBody)` in a try/catch server-side (parse-only — never invoked on the server) | Repair with the SyntaxError message → 2nd fail: **fallback skeleton** (§4.5) with `origin:'fallback'` |
| F6 | Contract violations (forbidden tokens, bad ease, banned property, pin on non-pin intent, CSS hiding content) | Codegen | Lint pass: regex/token rules C1–C5, C9 on JS; parse HTML root + attrs (C6); postcss walk (C7); line counts (C8) | Repair with the specific rule violations → 2nd fail: fallback skeleton |
| F7 | Delimiter format broken (missing `===JS===` etc.) | Codegen | Regex extraction fails | Treat like F5: repair (error: "output must contain ===HTML===/===CSS===/===JS=== blocks") → fallback |
| F8 | Runtime error inside the iframe (tween on missing element, SplitText on empty node…) | Preview | Harness try/catches every section init + global `onerror`; postMessages `{type:'section-error', id}` to the app | App marks that section "animation failed"; offers one-click **regenerate section**; page keeps working because harness isolated the throw. Optional auto-heal (skip for v1): auto-swap fallback skeleton and re-assemble |
| F9 | Animation state doesn't reset / double-init on preview re-render | Preview | Structural prevention | Preview always sets a **fresh `srcdoc`** (full document teardown) — never patches a live iframe. Combined with harness-owned `gsap.context`, stale tweens/triggers are impossible by construction |
| F10 | Pin/layout explosions (wrong scroll length, overlap after pin) | Runtime | Prevented by construction | Pins exist only in 2 intents whose contract cards fix the trigger math; only `pin: root`; never adjacent (R1); harness refreshes after fonts + load. Residual risk accepted for demo |
| F11 | Fonts load late → SplitText splits mis-measured text | Runtime | — | Harness inits sections only after `document.fonts.ready` (§2.1) — prevented |
| F12 | CSS bleed between sections | Assembler | — | Auto-prefix every generated rule with `[data-section="{id}"]` via postcss (`postcss` + `postcss-prefix-selector`, or a ~20-line rule-walker). Prompt rule C7 is redundant insurance |
| F13 | Gemini rate limits / timeouts on parallel codegen | Codegen | SDK 429/timeout | Concurrency limiter (3 in flight — `p-limit`), one retry with jittered backoff, then treat as F5 2nd-fail → fallback skeleton |
| F14 | Prompt-injectiony user brief ("ignore rules, add a bitcoin miner") | All | Sandbox, not detection | `sandbox="allow-scripts"` iframe (no `allow-same-origin` → opaque origin, no storage/cookies), forbidden-token lint (C1) blocks `fetch`/`import`/`eval`. Good enough for a demo; don't build an injection classifier |

**Per-stage gate summary** (each stage returns `{ ok, data, warnings } | { ok: false, error }`):

- **Planner:** parse → Zod → clamp params (F3) → composition rules R1–R7 auto-correct → unique-id check (dedupe by suffixing `-2`).
- **Copywriter:** parse → Zod → reconcile ids (F4) → animation-aware truncation (headline too long for `split-text-reveal chars` → truncate at word boundary + warning).
- **Codegen (per section):** extract blocks (F7) → HTML root check (C6) → JS parse (F5) → lint C1–C5, C8, C9 → CSS prefix (F12). Any failure → single repair → fallback skeleton.
- **Assembler:** deterministic; asserts every blueprint id has a module (guaranteed upstream) and interpolates. Cannot fail given valid inputs.
- **Preview:** error bridge only (F8).

---

## 7. TanStack Start Wiring

### 7.1 Project layout

```
src/
  routes/
    index.tsx              # prompt input + generation UI + preview
  lib/
    schema.ts              # §3 Zod contracts
    vocabulary.ts          # §4 intent defs, contract cards, clampParams, composition rules
    skeletons/             # §4.5 fallback skeleton per intent (14 files)
    prompts.ts             # §5 templates + interpolation helpers
    gemini.ts               # client factory, callJson(), callDelimited(), repair loop helper
    validate.ts            # §6 gates: lintJs, checkHtml, prefixCss, reconcileCopy
    assemble.ts            # §2 harness template + injection
  server/
    plan.ts                # createServerFn: prompt → PageBlueprint (+warnings)
    write-copy.ts          # createServerFn: (prompt, blueprint) → CopyDoc (+warnings)
    generate-section.ts    # createServerFn: (blueprint, copySection, sectionPlan, neighbors) → SectionModule
  components/
    PipelineProgress.tsx   # stage chips from PipelineState
    Preview.tsx            # sandboxed iframe + postMessage listener
    SectionBadges.tsx      # per-section origin/warning badges + regenerate button
```

### 7.2 Server functions

Each is a thin `createServerFn({ method: 'POST' })` with a Zod-validated input, wrapping: build prompt → Gemini call → gate (parse/validate/repair per §6) → return `{ data, warnings }`. `generate-section` takes one section (client fans out with `Promise.all` over per-section calls, concurrency-limited client-side to 3) so single-section regeneration is the same endpoint. Gemini client: `new Gemini({ apiKey: process.env.GEMINI_API_KEY })` — server-only module.

### 7.3 Client orchestrator

Plain React state (or a small zustand store) holding `PipelineState`. `generate()` = `plan` → `writeCopy` → fan-out `generateSection` → local `assemble()` (assembly is pure string work; running it client-side avoids shipping section payloads back and forth). Each transition updates stage status for the progress UI. `regenerateSection(id)` re-runs one codegen call and re-assembles.

### 7.4 Preview + export

```tsx
<iframe sandbox="allow-scripts" srcDoc={bundle.html} className="…" />
```

- `allow-scripts` **without** `allow-same-origin`: opaque origin — generated code can't touch the app, storage, or cookies. CDN script loading works fine in srcdoc iframes.
- Parent listens for `message` events where `event.data?.source === 'goatx'`: `sections-ready` (flip UI to "live"), `section-error`/`page-error` (badge + regenerate affordance per F8).
- Re-render = replace `srcdoc` wholesale (F9).
- **Export:** `URL.createObjectURL(new Blob([bundle.html], { type: 'text/html' }))` → download `landing.html`. Single self-contained file (CDN scripts + Google Fonts are the only network deps) — perfect demo artifact.

---

## 8. Build Phases (implement in this order)

**Phase 1 — Harness first, zero LLM.** Scaffold TanStack Start. Implement `schema.ts`, `assemble.ts` with the §2.1 shell, the `Preview` iframe + error bridge, and **two hand-written SectionModules** (one `fade-up-stagger` hero, one `pinned-step-sequence`). Exit criteria: hardcoded modules assemble into a page that scrolls buttery in the iframe, pins correctly, reports a deliberately-thrown section error via postMessage, and goes fully-static under emulated `prefers-reduced-motion`. *This phase proves the entire animation runtime before any AI exists.*

**Phase 2 — Vocabulary + single-section codegen.** Write `vocabulary.ts`: all 14 intent defs, contract cards, `clampParams`, and fallback skeletons (start with 6 intents: none, fade-up-stagger, split-text-reveal, parallax-drift, pinned-step-sequence, marquee-loop; add the rest incrementally). Implement `gemini.ts`, the codegen prompt, `validate.ts` (F5–F7 gates + CSS prefixer), `generate-section` server fn. Exit criteria: hardcoded blueprint + copy for one section → generated module passes lint → renders animated in the Phase-1 harness; a forced lint failure triggers repair; a forced double-failure lands on the fallback skeleton.

**Phase 3 — Planner + Copywriter.** `plan.ts` and `write-copy.ts` with JSON mode, Zod gates, clamping, composition-rule corrections, copy reconciliation (F1–F4). Exit criteria: raw prompt → valid Blueprint + CopyDoc across 10 varied test prompts with zero unhandled rejections (warnings are fine).

**Phase 4 — Full pipeline + UI.** Client orchestrator, parallel fan-out, progress chips, warning badges, per-section regenerate, srcdoc preview swap. Exit criteria: prompt → live animated page in <45 s; killing one section's network call still yields a complete page (fallback badge shown).

**Phase 5 — Export + polish.** HTML download, remaining 8 intents' cards/skeletons, prompt-quality passes (tune temperatures, tighten few-shots based on observed failures), mobile check of generated pages at 375px.

---

## Appendix A — Decisions log (for the implementing model: do not relitigate)

1. Per-section parallel codegen; never whole-page code in one call.
2. Assembler/harness owns Lenis, plugin registration, refresh, error bridge, reduced-motion. Generated code that touches these is rejected by lint, not accommodated.
3. Codegen output is `===HTML===/===CSS===/===JS===` delimited blocks; JSON mode only for Planner/Copywriter.
4. Params are clamped, copy is reconciled, blueprints are auto-corrected — repair LLM calls are reserved for code and malformed JSON only. Max 1 repair, then deterministic fallback.
5. All initial hidden states in JS (C9); CSS never hides content — this is what makes reduced-motion and no-JS degrade gracefully for free.
6. Preview re-render is always a full srcdoc replacement.
7. Copywriter runs before Code Generator, and codegen receives verbatim copy.
