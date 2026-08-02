/**
 * Canonical tone vocabulary — the single source for tone → token mapping.
 *
 * Two vocabularies, one scale:
 *   TINT_TONES — tinted surfaces (Badge, Chip): bg + text token pairs.
 *   BAR_TONES  — solid fills (DistributionStrip, meters): adds 'soft', the
 *                #4bb79b mid-green refinement that only reads on a bar scale;
 *                a "soft" tinted chip would be indistinguishable from 'good'.
 *
 * These map to CSS vars, so they are safe in DOM :style bindings but NOT in
 * ECharts/Mermaid option objects — those need literal hex from uiPalette.js.
 */

/** Tinted-surface tones (Badge, Chip). */
export const TINT_TONES = ['neutral', 'good', 'fair', 'elevated', 'critical', 'info']

/** Solid-fill tones (DistributionStrip segments, meter fills). */
export const BAR_TONES = ['neutral', 'good', 'soft', 'fair', 'elevated', 'critical', 'info']

/** tone → solid fill color (CSS var) for bars/segments/dots. */
export const TONE_SOLID = {
  good: 'var(--status-good)',
  soft: 'var(--status-good-soft)',
  fair: 'var(--status-fair)',
  elevated: 'var(--status-elevated)',
  critical: 'var(--status-critical)',
  neutral: 'var(--fleet-black-25)',
  info: 'var(--fleet-vibrant-blue)',
}

/**
 * Utilization → tone color (higher = worse; CSS var). The inverse scale of
 * gradeColors.scoreBandColor (higher = better) — pick by prop semantics,
 * never by eyeballing which colors look right at one call site.
 */
export function utilizationColor(pct) {
  const v = Number(pct)
  if (!isFinite(v)) return TONE_SOLID.neutral
  if (v >= 70) return TONE_SOLID.critical
  if (v >= 50) return TONE_SOLID.elevated
  if (v >= 30) return TONE_SOLID.fair
  return TONE_SOLID.good
}
