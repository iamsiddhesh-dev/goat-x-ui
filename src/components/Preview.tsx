import { useEffect, useRef } from 'react'

/* ============================================================================
 * Preview (AGENT_SPEC §7.4).
 *
 * Sandboxed iframe with `allow-scripts` but NOT `allow-same-origin`: the
 * generated page runs at an opaque origin and cannot touch the app, storage or
 * cookies. Re-render is always a wholesale `srcdoc` replacement (F9) — we never
 * patch a live iframe, so stale tweens/triggers are impossible by construction.
 *
 * The parent listens for postMessage events tagged `source: 'goatx'` from the
 * harness error bridge: `sections-ready`, `section-error`, `page-error`.
 * ========================================================================== */

export interface GoatxEvent {
  source: 'goatx'
  type: 'sections-ready' | 'section-error' | 'page-error' | string
  id?: string
  message?: string
  count?: number
  line?: number
}

export function Preview({
  html,
  onEvent,
}: {
  html: string
  onEvent?: (event: GoatxEvent) => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function handle(ev: MessageEvent) {
      const data = ev.data as GoatxEvent | undefined
      if (!data || data.source !== 'goatx') return
      onEvent?.(data)
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [onEvent])

  return (
    <iframe
      ref={frameRef}
      sandbox="allow-scripts"
      srcDoc={html}
      title="Generated landing page preview"
      style={{
        width: '100%',
        height: '100%',
        border: 0,
        display: 'block',
        background: '#000',
      }}
    />
  )
}
