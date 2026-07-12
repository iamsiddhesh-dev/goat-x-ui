# Vibely — Project Documentation

This folder is the **learning + revision archive** for Vibely: an AI agent
that generates premium, animation-heavy landing pages from a single text prompt.

It is written to be read **months from now, cold**. It does not assume you
remember why any decision was made. Every "why" is spelled out, every rejected
alternative is recorded, and every real bug we hit is written down with its fix.

> If you only read one file, read [01-overview.md](01-overview.md). If you want
> the deep "why", read [04-design-decisions-and-tradeoffs.md](04-design-decisions-and-tradeoffs.md).

---

## How to read this

| # | File | Read it when you want to… |
|---|------|---------------------------|
| — | [README.md](README.md) | Orient yourself (this file). |
| 01 | [01-overview.md](01-overview.md) | Understand *what* this is and the one core idea behind it. |
| 02 | [02-architecture.md](02-architecture.md) | See the whole system: the 6-stage pipeline, the runtime harness, data contracts, the file map. |
| 03 | [03-end-to-end-workflow.md](03-end-to-end-workflow.md) | Trace a single prompt through every stage with concrete data. |
| 04 | [04-design-decisions-and-tradeoffs.md](04-design-decisions-and-tradeoffs.md) | Understand *why* each choice was made and what we rejected. |
| 05 | [05-challenges-and-fixes.md](05-challenges-and-fixes.md) | Read the real problems we hit and exactly how we solved them. |
| 06 | [06-limitations.md](06-limitations.md) | Know what this system *cannot* do and why (including API limits). |
| 07 | [07-future-work.md](07-future-work.md) | See what could be done differently or added next. |
| 08 | [08-reference.md](08-reference.md) | Look up the 15 intents, the C/R/F rule tables, the file map — the cheat sheet. |

The canonical build spec is [`../AGENT_SPEC.md`](../AGENT_SPEC.md) in the repo
root. This documentation folder **explains and reflects on** that spec; the spec
itself is the terse source of truth.

---

## The 30-second summary

- **Input:** one line of text ("a landing page for a monospace font foundry").
- **Output:** a single self-contained `.html` file — a scroll-animated landing
  page using GSAP ScrollTrigger + Lenis smooth-scroll — previewable live and
  downloadable.
- **The trick:** the AI never writes the fragile scroll-engine plumbing. A fixed
  **runtime harness** owns all of that. The AI only writes small, isolated
  section modules, constrained by a **closed vocabulary of 15 animation
  intents**. This is the single decision that makes the whole thing reliable.

---

## Tech stack

| Concern | Choice |
|---|---|
| Full-stack framework | TanStack Start (React 19, TypeScript, Vite) |
| LLM | Google Gemini REST API — `gemini-3-flash-preview` |
| Validation / contracts | Zod |
| Animation runtime (in generated page) | GSAP 3.13 (ScrollTrigger, SplitText) + Lenis 1.3, from CDN |
| Concurrency | `p-limit` (client fan-out) + a custom sliding-window rate gate (server) |
| Preview isolation | sandboxed `<iframe srcdoc>` (opaque origin) |

---

## Running it locally

```bash
npm install
npm run dev          # vite dev — usually http://localhost:3000
```

Requires `GEMINI_API_KEY` in `.env`. Other scripts:

```bash
npm run typecheck        # tsc --noEmit
npm run verify:phase2    # validator + skeleton + codegen-path checks (no API)
npm run verify:phase3    # planner/copywriter gate checks (no API)
npm run emit-preview     # emit an offline-vendored harness page for browser inspection
```

`scripts/prompt-quality-pass.ts` hits the **real** Gemini API to eyeball
generation quality across several briefs (diagnostic, not a pass/fail test).
