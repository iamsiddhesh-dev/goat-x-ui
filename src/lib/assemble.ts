import type { SectionModule, ThemeTokens } from './schema'
import {
  genericFallback,
  googleFontsUrl,
  resolveBodyFont,
  resolveDisplayFont,
} from './fonts'

/* ============================================================================
 * Assembler (AGENT_SPEC §2 / §5-wiring).
 *
 * Deterministic, zero-LLM. Injects validated section modules into the FIXED
 * runtime harness. Generated code never initializes Lenis, never wires
 * ScrollTrigger to the scroller, never calls ScrollTrigger.refresh(). The whole
 * class of "smooth-scroll integration is subtly broken" bugs is removed by
 * never letting the model write that code.
 * ========================================================================== */

export interface AssembleInput {
  meta: { title: string; description?: string }
  theme: ThemeTokens
  sections: SectionModule[]
}

export interface AssembleOptions {
  /**
   * Dev/testing affordance: force the harness's reduced-motion branch on,
   * independent of the OS setting. The sandboxed, opaque-origin iframe can't be
   * probed from the parent, so this injected flag is how we verify that the
   * page degrades to a fully-static, fully-readable document (rule C9).
   */
  forceReducedMotion?: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** One `window.__registerSection` wrapper per module. */
function registerBlock(mod: SectionModule): string {
  return `window.__registerSection(${JSON.stringify(mod.id)}, function (root) {
${mod.js}
});`
}

/**
 * Assemble a full, single-file HTML document from theme + section modules.
 * The output is what gets fed to the preview iframe's `srcdoc` and to export.
 */
export function assemble(
  input: AssembleInput,
  options: AssembleOptions = {},
): string {
  const { meta, theme, sections } = input
  const { colors, radius } = theme

  const displayFont = resolveDisplayFont(theme.fonts.display)
  const bodyFont = resolveBodyFont(theme.fonts.body)
  const fontsHref = googleFontsUrl(theme.fonts.display, theme.fonts.body)

  const sectionsHtml = sections.map((s) => s.html).join('\n\n')
  const sectionsCss = sections
    .map((s) => s.css)
    .filter(Boolean)
    .join('\n\n')
  const sectionsJs = sections.map(registerBlock).join('\n\n')

  const reducedMotionPrelude = options.forceReducedMotion
    ? `<script>window.__GOATX_FORCE_REDUCED = true;</script>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)}</title>
  ${meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}" />` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontsHref}" rel="stylesheet" />
  <style>
    /* -- reset + tokens (fixed) -- */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-font-smoothing:antialiased}
    img,svg,video{display:block;max-width:100%}
    :root{
      --bg:${colors.bg}; --surface:${colors.surface};
      --text:${colors.text}; --muted:${colors.muted};
      --accent:${colors.accent}; --accent-contrast:${colors.accentContrast};
      --font-display:'${displayFont}',${genericFallback(displayFont)};
      --font-body:'${bodyFont}',${genericFallback(bodyFont)};
      --radius:${radius}px;
      --space:clamp(4rem, 10vw, 9rem); /* standard inter-section rhythm */
    }
    body{background:var(--bg);color:var(--text);font-family:var(--font-body);overflow-x:hidden}
    h1,h2,h3{font-family:var(--font-display);line-height:1.05;letter-spacing:-0.02em}
    section[data-section]{position:relative;padding:var(--space) clamp(1.25rem,5vw,4rem)}
    .container{max-width:1200px;margin-inline:auto}
    /* -- per-section CSS injected below, each block auto-prefixed -- */
${sectionsCss}
  </style>
</head>
<body>
  <main id="page">
${sectionsHtml}
  </main>

  ${reducedMotionPrelude}
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
      var reduced = window.__GOATX_FORCE_REDUCED ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      inits.forEach(function (entry) {
        var root = document.querySelector('[data-section="' + entry.id + '"]');
        if (!root) { report('section-error', { id: entry.id, message: 'root not found' }); return; }
        if (reduced) return; // all hidden-states live in JS (rule C9) -> skipping init = fully visible static page
        try {
          // gsap.context scopes selector-text inside tweens to root automatically
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
${sectionsJs}
  </script>

  <script>
  document.fonts.ready.then(function () {
    window.__initSections();
    ScrollTrigger.refresh();
  });
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  </script>
</body>
</html>`
}
