import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { assemble } from '../lib/assemble'
import { Preview, type GoatxEvent } from '../components/Preview'
import {
  baseSections,
  meta,
  theme,
  withBrokenSection,
} from '../fixtures/phase1'

export const Route = createFileRoute('/harness')({
  component: Phase1Harness,
})

interface LogEntry {
  at: number
  event: GoatxEvent
}

function Phase1Harness() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [injectBroken, setInjectBroken] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  const sections = injectBroken ? withBrokenSection : baseSections

  const html = useMemo(
    () =>
      assemble(
        { meta, theme, sections },
        { forceReducedMotion: reducedMotion },
      ),
    [sections, reducedMotion],
  )

  // Wholesale teardown on any config change: new key => fresh iframe + srcdoc.
  const previewKey = `${injectBroken ? 'broken' : 'base'}-${reducedMotion ? 'rm' : 'motion'}`

  // Clear the event log whenever we swap the document.
  useEffect(() => {
    setLog([])
  }, [previewKey])

  const onEvent = useCallback((event: GoatxEvent) => {
    setLog((prev) => [...prev, { at: Date.now(), event }])
  }, [])

  const download = useCallback(() => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'landing.html'
    a.click()
    URL.revokeObjectURL(url)
  }, [html])

  const readyCount = log.find((l) => l.event.type === 'sections-ready')?.event
    .count
  const errorEvents = log.filter(
    (l) => l.event.type === 'section-error' || l.event.type === 'page-error',
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '360px 1fr',
        height: '100vh',
        width: '100vw',
      }}
    >
      {/* -------- control panel -------- */}
      <aside
        style={{
          borderRight: '1px solid var(--app-border)',
          padding: '20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <header>
          <h1 style={{ fontSize: 18, margin: 0 }}>Vibely</h1>
          <p style={{ color: 'var(--app-muted)', margin: '4px 0 0' }}>
            Phase 1 — runtime harness verification
          </p>
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionTitle>Controls</SectionTitle>
          <Toggle
            label="Emulate prefers-reduced-motion"
            hint="Skips all section init — page must stay fully readable & static"
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
          <Toggle
            label="Inject a throwing section"
            hint="Its init throws — harness must isolate it and report a section-error"
            checked={injectBroken}
            onChange={setInjectBroken}
          />
          <button onClick={download} style={btnStyle}>
            Download landing.html
          </button>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionTitle>Harness bridge</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={readyCount != null ? 'good' : 'idle'}>
              {readyCount != null
                ? `sections-ready · ${readyCount}`
                : 'waiting…'}
            </Badge>
            <Badge tone={errorEvents.length ? 'bad' : 'idle'}>
              {errorEvents.length} error
              {errorEvents.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 0,
          }}
        >
          <SectionTitle>Event log</SectionTitle>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid var(--app-border)',
              borderRadius: 8,
              padding: 8,
              background: 'var(--app-panel)',
              fontFamily:
                'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace',
              fontSize: 12,
            }}
          >
            {log.length === 0 ? (
              <span style={{ color: 'var(--app-muted)' }}>
                No messages yet.
              </span>
            ) : (
              log.map((l, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: eventColor(l.event.type) }}>
                    {l.event.type}
                  </span>
                  {l.event.id ? (
                    <span style={{ color: 'var(--app-muted)' }}>
                      {' '}
                      · {l.event.id}
                    </span>
                  ) : null}
                  {l.event.message ? (
                    <div style={{ color: 'var(--app-muted)', paddingLeft: 8 }}>
                      {l.event.message}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        <p style={{ color: 'var(--app-muted)', fontSize: 12, margin: 0 }}>
          Scroll the preview: hero staggers in, the showcase pins and hands off
          its steps. Toggle reduced-motion to see the static fallback; inject the
          broken section to watch the error bridge fire.
        </p>
      </aside>

      {/* -------- preview -------- */}
      <main style={{ minWidth: 0 }}>
        <Preview key={previewKey} html={html} onEvent={onEvent} />
      </main>
    </div>
  )
}

/* ---------- tiny presentational helpers ---------- */

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--app-text)',
  border: '1px solid var(--app-border)',
  borderRadius: 8,
  padding: '8px 12px',
  textAlign: 'left',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '.12em',
        color: 'var(--app-muted)',
        margin: 0,
      }}
    >
      {children}
    </h2>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ display: 'block' }}>{label}</span>
        {hint ? (
          <span
            style={{
              display: 'block',
              color: 'var(--app-muted)',
              fontSize: 12,
            }}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'good' | 'bad' | 'idle'
}) {
  const color =
    tone === 'good'
      ? 'var(--app-good)'
      : tone === 'bad'
        ? 'var(--app-bad)'
        : 'var(--app-muted)'
  return (
    <span
      style={{
        border: `1px solid ${color}`,
        color,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 12,
      }}
    >
      {children}
    </span>
  )
}

function eventColor(type: string): string {
  if (type === 'sections-ready') return 'var(--app-good)'
  if (type === 'section-error' || type === 'page-error') return 'var(--app-bad)'
  return 'var(--app-text)'
}
