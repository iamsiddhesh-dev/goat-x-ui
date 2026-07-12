# Vibely

**Describe a landing page in one sentence. Get back a live, scroll-animated page
you can preview and download.**

Vibely is an AI agent that plans, writes copy for, and generates a complete
animated landing page — GSAP ScrollTrigger effects, Lenis smooth-scroll, the
whole thing — from a single prompt like:

> "a landing page for a monospace font foundry, dark and nerdy"

No templates. Every run produces a different page: different copy, different
palette, different combination of scroll effects, all generated live by an LLM
(Google Gemini).

---

## What makes this different

Most "AI website generator" demos produce a static page, because scroll-driven
animation (pinned sections, parallax, staggered reveals, horizontal scroll
tracks) is exactly where LLM-generated code breaks — pin math, smooth-scroll
integration, and reveal timing are all narrow-but-deep failure surfaces.

Vibely's answer: **the model never writes the fragile scroll-engine code.**

- A fixed **runtime harness** owns Lenis, the GSAP ticker, plugin registration,
  and refresh timing — identical on every generated page. The model's code
  literally cannot touch it (a linter rejects the tokens).
- The model can only choose from a **closed vocabulary of 15 animation
  intents** (fade-up-stagger, split-text-reveal, pinned-step-sequence,
  horizontal-scroll-track, …), each with a param schema, a hard mechanical
  contract, and a deterministic fallback if generation fails.
- Inside those walls the model is fully free — it invents the DOM, the layout,
  the copy, and the choreography. Two pages using the same intent look nothing
  alike.

This is the "closed vocabulary, open choreography" idea, and it's why the
output is reliably animated instead of reliably static.

---

## How it works

```
prompt
  │
  ▼
1. PLANNER      — theme (palette/fonts) + section list + one animation intent per section
  ▼
2. COPYWRITER   — real headline/body/stats/CTA copy for every section
  ▼
3. CODE GEN     — per section, in parallel: HTML + CSS + a GSAP init function
  ▼
4. VALIDATE     — lint every section against the animation contract; 1 auto-repair;
                  else fall back to a hand-written, known-good implementation
  ▼
5. ASSEMBLE     — inject validated sections into the fixed runtime harness
  ▼
6. PREVIEW      — sandboxed iframe, live; export to a single landing.html
```

- **Planning and copywriting** are one LLM call each (JSON mode).
- **Code generation runs per-section, in parallel** (not one whole-page call) —
  this keeps each output small enough for the model to get right, lets sections
  fail independently, and is what makes single-section **regenerate** possible.
- **Nothing hard-fails.** Bad JSON gets one repair call and then deterministic
  correction; bad generated code gets one repair call and then falls back to a
  hand-written skeleton for that exact animation intent. A run always produces
  a complete page.
- Every generated page degrades to a **fully readable static page** with
  JavaScript off or `prefers-reduced-motion` set — this falls out of one rule
  (all hidden/initial states live in JS, never in CSS), not a special code path.

## Try it

```bash
npm install
npm run dev
```

Set `GEMINI_API_KEY` in a `.env` file, open `http://localhost:3000`, type a
prompt, hit Generate.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (React 19 + TypeScript + Vite) |
| LLM | Google Gemini — `gemini-3-flash-preview` (plain REST, no SDK) |
| Schema / validation | Zod — one shared contract per pipeline stage |
| Animation (generated pages) | GSAP 3.13 (ScrollTrigger, SplitText) + Lenis 1.3 |
| Preview isolation | sandboxed `<iframe>` (opaque origin, `allow-scripts` only) |
| Concurrency | `p-limit` (client fan-out) + a sliding-window rate gate (server) |

---

## Limitations

- **Rate-limited by design** — the free Gemini tier caps out around 5
  requests/min per model; a page with several sections is 8–10 small calls, so
  back-to-back generations queue rather than run instantly.
- **Closed animation vocabulary** — if an effect isn't one of the 15 intents,
  the planner has to approximate with the nearest one. Adding a genuinely new
  effect is a real (if well-defined) code change, not a prompt tweak.
- **No cross-section aesthetic pass** — sections are generated independently
  and share only the page's theme + their immediate neighbours' kind. Cohesion
  is good, not guaranteed; there's no "does this page's rhythm work" judgment
  call, and no aesthetic QA beyond structural/runtime validation.
- **Errors are caught, not silently self-healed** — a section that throws at
  runtime is isolated and flagged with a regenerate option; it doesn't
  automatically retry on its own.
- **Single export format** — one self-contained `.html` file. No accounts,
  no saved history, no multi-page sites.

## Status

Actively developed. The animation vocabulary has grown from an initial set to
15 intents as new scroll patterns are added; each addition ships with its own
contract, param schema, and fallback so reliability never regresses.
