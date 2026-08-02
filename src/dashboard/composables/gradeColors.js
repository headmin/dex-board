/**
 * The single grade/score → color implementation. Replaces the nine divergent
 * per-component maps found in the UI audit (four of which rendered grade B
 * blue). Thresholds mirror core-scores.ts: A>=90, B>=75, C>=60, D>=40, F<40.
 *
 * Conventions (per the capex-savings mockups):
 * - Discrete grade badges/letters: A and B are BOTH brand green.
 * - Ordinal bands/ramps (bars, heat cells): the green band splits into
 *   green / soft-green so gradients stay readable.
 * - Table TEXT: healthy values read as plain navy; only degraded values
 *   are tinted (gold -> orange -> red).
 */
import { palette } from './uiPalette'

const GRADE = {
  A: palette.good,
  B: palette.good,
  C: palette.fair,
  D: palette.elevated,
  F: palette.critical,
}

/** Discrete grade letter -> color (badges, grade displays). */
export function gradeColor(grade) {
  return GRADE[(grade || '').toUpperCase()] || palette.ink50
}

/** 0-100 score -> grade letter (mirrors the composite CASE in core-scores.ts). */
export function scoreToGrade(v) {
  if (v == null || !isFinite(Number(v))) return null
  const n = Number(v)
  if (n >= 90) return 'A'
  if (n >= 75) return 'B'
  if (n >= 60) return 'C'
  if (n >= 40) return 'D'
  return 'F'
}

/** 0-100 score -> BAR/CELL fill color (ordinal band; green band splits). */
export function scoreBandColor(v) {
  if (v == null || v < 0) return palette.ink50
  if (v >= 90) return palette.good
  if (v >= 75) return palette.greenSoft
  if (v >= 60) return palette.fair
  if (v >= 40) return palette.elevated
  return palette.critical
}

/** 0-100 score -> TEXT color (healthy = navy; degraded tinted). */
export function scoreTextColor(v) {
  if (v == null) return palette.ink50
  if (v >= 75) return palette.ink75
  if (v >= 60) return palette.fairText
  if (v >= 40) return palette.elevated
  return palette.critical
}
