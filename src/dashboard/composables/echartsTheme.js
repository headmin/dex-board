/**
 * Shared ECharts option fragments — one place for the tooltip/axis/dataZoom
 * boilerplate duplicated across the eight chart components, plus the
 * resolveColor() guard (hoisted from TimeSeriesChart) that converts a
 * mistakenly-passed 'var(--token)' into its computed value.
 */
import { palette } from './uiPalette'

/** ECharts can't resolve CSS custom properties — resolve them here. */
export function resolveColor(c) {
  if (!c) return c
  const m = String(c).match(/var\(\s*(--[\w-]+)\s*\)/)
  if (!m) return c
  if (typeof document === 'undefined') return c
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
  return v || c
}

export const baseTooltip = {
  trigger: 'axis',
  backgroundColor: palette.tooltipBg,
  borderColor: palette.tooltipBg,
  textStyle: { color: '#fff', fontSize: 11 },
  borderRadius: 4,
}

export const baseAxisLabel = { color: palette.ink50, fontSize: 10 }
export const baseAxisLine = { lineStyle: { color: palette.ink10 } }
export const baseSplitLine = { lineStyle: { color: '#f0f1f4' } }

export const baseDataZoom = {
  fillerColor: 'rgba(106, 103, 254, 0.15)',
  handleStyle: { color: palette.info },
}
