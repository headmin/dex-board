import { gradeColor, scoreToGrade } from './gradeColors'
import { displayHost } from './displayName'

/**
 * "Save briefing" — renders the current Experience-score view as a fully
 * self-contained HTML file (inline CSS, no scripts, no external assets) and
 * triggers a download. The artifact is meant to be attached to an email or
 * dropped in a slide deck: colors are literal hex on purpose.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const GRADE_TINT = { A: '#deedea', B: '#deedea', C: '#fff5d7', D: '#fdeee8', F: '#fde8e8' }
const GRADE_TEXT = { A: '#009a7d', B: '#009a7d', C: '#a47f1e', D: '#c14e2e', F: '#c92f2f' }

function gradeBadge(g) {
  if (!g) return ''
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:13px;font-weight:700;background:${GRADE_TINT[g] || '#f4f4f6'};color:${GRADE_TEXT[g] || '#515774'};">${esc(g)}</span>`
}

function deltaSpan(d, digits = 1) {
  if (d == null || Number(d) === 0) return '<span style="color:#8b8fa2;">0</span>'
  const n = Number(d)
  const color = n > 0 ? '#009a7d' : '#c92f2f'
  return `<span style="font-family:ui-monospace,monospace;font-weight:700;color:${color};">${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}</span>`
}

export function buildBriefingHtml({ fleet, tileDeltas, categories, exposureView, distribution, deviceList, movers, teamRows, deltaLabel }) {
  const now = new Date()
  const stamp = now.toUTCString()
  const WEIGHTS = { device_health: '25%', performance: '35%', security: '20%', software: '20%', network: 'context' }

  const catRows = categories.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:600;">${esc(c.label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;">${gradeBadge(c.grade)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:700;">${c.score ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;text-align:right;">${deltaSpan(tileDeltas?.[c.key])}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;color:#8b8fa2;">${WEIGHTS[c.key] || ''}</td>
    </tr>`).join('')

  const moverRows = (movers || []).slice(0, 8).map(m => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:600;">${esc(displayHost(m))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;">${gradeBadge(m.prev_grade)} <span style="color:#b3b6c1;">→</span> ${gradeBadge(m.curr_grade)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;text-align:right;">${deltaSpan(m.delta, 0)}</td>
    </tr>`).join('')

  const teamRowsHtml = (teamRows || []).filter(t => !t.unscorable).map(t => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:600;">${esc(t.team_id)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;color:#8b8fa2;">${t.hosts} hosts</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;">${gradeBadge(scoreToGrade(t.avg_composite))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:700;">${t.avg_composite != null ? Math.round(t.avg_composite) : '—'}</td>
    </tr>`).join('')

  // Only hosts genuinely below the B line belong in "needing attention" —
  // padding the list with healthy hosts would fabricate urgency.
  const attention = [...(deviceList || [])]
    .filter(d => Number(d.composite_score) < 75)
    .sort((a, b) => Number(a.composite_score) - Number(b.composite_score))
    .slice(0, 10)
  const worstHosts = attention
    .map(d => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:600;">${esc(displayHost(d))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;">${gradeBadge(d.composite_grade)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;font-weight:700;">${esc(d.composite_score)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f4f4f6;color:#515774;">${esc(String(d.cpu_class || '').replace(/_/g, ' '))} · ${esc(String(d.ram_tier || '').toUpperCase())}</td>
    </tr>`).join('')

  const distLine = ['A', 'B', 'C', 'D', 'F'].map(g => `<strong style="color:#192147;">${distribution?.[g] || 0}</strong> ${g}`).join(' · ')
  const exposure = exposureView?.available
    ? `<p style="margin:6px 0 0;font-size:13px;color:#515774;">${esc(exposureView.headline)} ${esc(exposureView.detail)}</p>`
    : ''

  const heroDelta = tileDeltas?.composite
  const gc = gradeColor(fleet.grade) || '#009a7d'

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>DEX briefing · ${esc(now.toISOString().slice(0, 10))}</title></head>
<body style="margin:0;padding:32px;background:#f9fafc;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#192147;">
<div style="max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:20px;">
  <div>
    <h1 style="margin:0;font-size:22px;">DEX briefing — Experience score</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#515774;">Generated ${esc(stamp)} · ${fleet.deviceCount || 0} hosts scored · tiles compare vs ${esc(deltaLabel || 'window start')}</p>
  </div>

  <div style="background:#192147;border-radius:12px;padding:24px 28px;color:#fff;display:flex;align-items:center;gap:28px;">
    <div style="display:flex;align-items:baseline;gap:12px;">
      <span style="font-size:56px;font-weight:700;line-height:0.9;color:${gc};">${esc(fleet.grade)}</span>
      <span style="font-size:30px;font-weight:600;">${fleet.score ?? '—'}<span style="font-size:14px;color:#8b8fa2;">/100</span></span>
    </div>
    <div style="font-size:14px;color:#e2e4ea;">
      Fleet composite${heroDelta != null ? ` · ${heroDelta >= 0 ? '▲' : '▼'} ${Math.abs(Number(heroDelta)).toFixed(1)} pts vs ${esc(deltaLabel)}` : ''}
      ${exposure}
    </div>
  </div>

  <div style="background:#fff;border:1px solid #e2e4ea;border-radius:8px;padding:16px 4px;">
    <h2 style="margin:0 12px 8px;font-size:15px;">Categories</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="color:#8b8fa2;font-size:11px;text-align:left;"><th style="padding:6px 12px;">Category</th><th style="padding:6px 12px;">Grade</th><th style="padding:6px 12px;">Score</th><th style="padding:6px 12px;text-align:right;">Δ</th><th style="padding:6px 12px;">Weight</th></tr>
      ${catRows}
    </table>
  </div>

  ${teamRowsHtml ? `<div style="background:#fff;border:1px solid #e2e4ea;border-radius:8px;padding:16px 4px;">
    <h2 style="margin:0 12px 8px;font-size:15px;">Score by fleet</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">${teamRowsHtml}</table>
  </div>` : ''}

  ${moverRows ? `<div style="background:#fff;border:1px solid #e2e4ea;border-radius:8px;padding:16px 4px;">
    <h2 style="margin:0 12px 8px;font-size:15px;">Biggest movers (7d)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">${moverRows}</table>
  </div>` : ''}

  <div style="background:#fff;border:1px solid #e2e4ea;border-radius:8px;padding:16px 4px;">
    <h2 style="margin:0 12px 4px;font-size:15px;">Hosts needing attention</h2>
    <p style="margin:0 12px 8px;font-size:12px;color:#515774;">Grade distribution: ${distLine}</p>
    ${attention.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${worstHosts}</table>`
      : `<p style="margin:0 12px;font-size:13px;color:#515774;">No hosts below the B line in this window — nothing needs attention.</p>`}
  </div>

  <p style="margin:0;font-size:11px;color:#8b8fa2;">Snapshot artifact exported from DEX Board — figures reflect the fleet at generation time and the filters active in the app.</p>
</div>
</body></html>`
}

export function downloadBriefing(html) {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dex-briefing-${new Date().toISOString().slice(0, 10)}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
