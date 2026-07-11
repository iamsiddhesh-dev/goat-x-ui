import { writeFileSync, mkdirSync } from 'node:fs'
import { assemble } from '../src/lib/assemble'
import { meta, theme, withBrokenSection } from '../src/fixtures/phase1'

// Diagnostic: emit the assembled document to public/ so it can be loaded
// top-level (non-sandboxed) to inspect console/network of the harness itself.
const emitFor = process.argv.includes('--rm')
const html = assemble(
  { meta, theme, sections: withBrokenSection },
  { forceReducedMotion: emitFor },
)
// For offline verification in the in-app browser pane (which blocks outbound
// internet), rewrite the CDN script URLs to locally-vendored copies. This does
// NOT touch the production assembler — it only affects this diagnostic file.
const offline = html
  .replace(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@3\.13\.0\/dist\//g,
    '/vendor/',
  )
  .replace(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/lenis@1\.3\.4\/dist\//g,
    '/vendor/',
  )
// Diagnostic capture: this file is loaded top-level, so the harness's
// `parent.postMessage` posts to this same window. Record goatx events so a
// JS probe can assert on them (sections-ready count, section-error id).
const withProbe = offline.replace(
  '<body>',
  `<body>
  <script>
    window.__goatxEvents = [];
    window.addEventListener('message', function (e) {
      if (e && e.data && e.data.source === 'goatx') window.__goatxEvents.push(e.data);
    });
  </script>`,
)
const outFile = emitFor
  ? 'public/preview-test-rm.html'
  : 'public/preview-test.html'
mkdirSync('public', { recursive: true })
writeFileSync(outFile, withProbe)
console.log('wrote', outFile, withProbe.length, 'bytes')
