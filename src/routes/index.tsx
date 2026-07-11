import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Preview, type GoatxEvent } from '../components/Preview'
import { usePipeline } from '../hooks/usePipeline'
import type { StageStatus } from '../lib/pipeline'

export const Route = createFileRoute('/')({
  component: Generator,
})

function Generator() {
  const [prompt, setPrompt] = useState('')
  const { state, generate, regenerateSection } = usePipeline()
  const [events, setEvents] = useState<GoatxEvent[]>([])

  const onEvent = useCallback((event: GoatxEvent) => {
    setEvents((prev) => [...prev, event])
  }, [])

  const onGenerate = useCallback(() => {
    if (!prompt.trim() || state.isRunning) return
    setEvents([])
    void generate(prompt.trim())
  }, [prompt, state.isRunning, generate])

  const bundle = state.bundle
  const sectionIds = state.sectionIds

  const download = useCallback(() => {
    if (!bundle) return
    const blob = new Blob([bundle.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'landing.html'
    a.click()
    URL.revokeObjectURL(url)
  }, [bundle])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
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
          <h1 style={{ fontSize: 18, margin: 0 }}>GOAT-X-UI</h1>
          <p style={{ color: 'var(--app-muted)', margin: '4px 0 0' }}>
            Describe a landing page. The agent plans, writes copy, and
            generates each section's animation in parallel.
          </p>
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. landing page for a monospace font foundry, dark and nerdy"
            rows={4}
            style={{
              background: 'var(--app-panel)',
              color: 'var(--app-text)',
              border: '1px solid var(--app-border)',
              borderRadius: 8,
              padding: '10px 12px',
              resize: 'vertical',
              font: 'inherit',
            }}
          />
          <button
            onClick={onGenerate}
            disabled={!prompt.trim() || state.isRunning}
            style={{
              ...btnStyle,
              opacity: !prompt.trim() || state.isRunning ? 0.5 : 1,
              cursor:
                !prompt.trim() || state.isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {state.isRunning ? 'Generating…' : 'Generate'}
          </button>
          {bundle ? (
            <button onClick={download} style={btnStyle}>
              Download landing.html
            </button>
          ) : null}
        </section>

        {state.error ? (
          <section
            style={{
              border: '1px solid var(--app-bad)',
              borderRadius: 8,
              padding: 10,
              color: 'var(--app-bad)',
              fontSize: 13,
            }}
          >
            {state.error}
          </section>
        ) : null}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionTitle>Progress</SectionTitle>
          <StageRow label="Planning" status={state.planner} />
          <StageRow label="Writing copy" status={state.copywriter} />
          {sectionIds.map((id) => (
            <StageRow
              key={id}
              label={id}
              status={state.sections[id] ?? 'idle'}
              indent
              origin={state.sectionOrigin[id]}
              onRegenerate={
                bundle && state.sections[id] !== 'running'
                  ? () => void regenerateSection(id)
                  : undefined
              }
            />
          ))}
        </section>

        {bundle && bundle.warnings.length > 0 ? (
          <section
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <SectionTitle>Warnings ({bundle.warnings.length})</SectionTitle>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 160,
                overflowY: 'auto',
              }}
            >
              {bundle.warnings.map((w, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    color: 'var(--app-muted)',
                    border: '1px solid var(--app-border)',
                    borderRadius: 6,
                    padding: '4px 8px',
                  }}
                >
                  {w}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 0,
          }}
        >
          <SectionTitle>Harness bridge</SectionTitle>
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
              maxHeight: 140,
            }}
          >
            {events.length === 0 ? (
              <span style={{ color: 'var(--app-muted)' }}>
                No messages yet.
              </span>
            ) : (
              events.map((e, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span
                    style={{
                      color:
                        e.type === 'sections-ready'
                          ? 'var(--app-good)'
                          : e.type === 'section-error' ||
                              e.type === 'page-error'
                            ? 'var(--app-bad)'
                            : 'var(--app-text)',
                    }}
                  >
                    {e.type}
                  </span>
                  {e.id ? (
                    <span style={{ color: 'var(--app-muted)' }}> · {e.id}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </aside>

      {/* -------- preview -------- */}
      <main style={{ minWidth: 0 }}>
        {bundle ? (
          <Preview key={bundle.html.length} html={bundle.html} onEvent={onEvent} />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--app-muted)',
            }}
          >
            {state.isRunning ? 'Generating your page…' : 'Enter a prompt to begin.'}
          </div>
        )}
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

function StageRow({
  label,
  status,
  indent,
  origin,
  onRegenerate,
}: {
  label: string
  status: StageStatus
  indent?: boolean
  origin?: string
  onRegenerate?: () => void
}) {
  const color =
    status === 'done'
      ? 'var(--app-good)'
      : status === 'error'
        ? 'var(--app-bad)'
        : status === 'running'
          ? 'var(--app-accent, #d9a441)'
          : 'var(--app-muted)'
  const symbol =
    status === 'done'
      ? '✓'
      : status === 'error'
        ? '✕'
        : status === 'running'
          ? '…'
          : '·'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingLeft: indent ? 12 : 0,
        fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color, width: 14, display: 'inline-block' }}>
          {symbol}
        </span>
        <span>{label}</span>
        {origin && origin !== 'generated' ? (
          <span
            style={{
              fontSize: 10,
              color: origin === 'fallback' ? 'var(--app-bad)' : 'var(--app-muted)',
              border: '1px solid var(--app-border)',
              borderRadius: 999,
              padding: '0 6px',
            }}
          >
            {origin}
          </span>
        ) : null}
      </span>
      {onRegenerate ? (
        <button
          onClick={onRegenerate}
          style={{
            background: 'transparent',
            color: 'var(--app-muted)',
            border: '1px solid var(--app-border)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          regenerate
        </button>
      ) : null}
    </div>
  )
}
