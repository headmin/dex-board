/**
 * JS mirror of the design tokens in styles/fleet-tokens.css.
 *
 * ECharts paints to canvas and Mermaid parses its own style directives —
 * neither can resolve CSS var(). Every color handed to a chart option or a
 * diagram string MUST be a literal hex, and it must come from here so the
 * CSS tokens and the JS palette can only drift in one reviewable place.
 *
 * Rule of thumb: quoted 'var(--x)' in a CHART/DIAGRAM option object is a bug
 * (DOM :style bindings resolve var() fine and may keep using tokens).
 */
export const palette = {
  // Neutrals (mirror --fleet-black* / --fleet-off-white)
  ink: '#192147',
  ink75: '#515774',
  ink50: '#8b8fa2',
  ink33: '#b3b6c1',
  ink25: '#c5c7d1',
  ink10: '#e2e4ea',
  ink5: '#f4f4f6',
  offWhite: '#f9fafc',
  white: '#ffffff',

  // Brand
  green: '#009a7d',
  greenOver: '#00886c',
  greenSoft: '#4bb79b',

  // Canonical status scale (mirror --status-*)
  good: '#009a7d',
  goodBg: '#deedea',
  fair: '#ecc767',
  fairText: '#a47f1e',
  fairBg: '#fff5d7',
  elevated: '#eb6743',
  elevatedAlt: '#ec9545',
  elevatedBg: '#fdeee8',
  critical: '#eb4343',
  criticalSoft: '#ef6969',
  criticalBg: '#fde8e8',

  // Accents (chart/info identity — NOT status colors)
  info: '#6a67fe',
  purple: '#ae6ddf',
  tooltipBg: '#3e4771',
}

/** Categorical series palette for multi-series charts (identity, not status). */
export const categorical = [
  '#6a67fe', '#009a7d', '#ae6ddf', '#ecc767', '#5cabdf', '#ff5c83',
]

/** Ordinal good→bad ramp for heatmaps / banded scales. */
export const statusRamp = [
  palette.good, palette.greenSoft, palette.fair, palette.elevated, palette.critical,
]
