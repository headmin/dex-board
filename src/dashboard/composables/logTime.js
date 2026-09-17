/**
 * Age-compressed time scale — logarithmic in AGE, not in value.
 *
 * A linear time axis spends the same pixels on "14 weeks ago" as on
 * "yesterday". For fleet history that is backwards: what happened this week is
 * what you act on, and last quarter is context you only need the shape of. As
 * the series grows (dex_scores_daily gains a row a day, forever) a linear axis
 * gets steadily worse — the actionable end keeps shrinking.
 *
 * So position by log of age: recent days get most of the width, and each older
 * decade of time folds into a narrower band. You keep a long tail visible
 * without giving up detail at the near end.
 *
 *   x = 1 - log1p(age) / log1p(maxAge)
 *
 *   age 0 (now)      -> x = 1   (right edge)
 *   age = maxAge     -> x = 0   (left edge)
 *
 * Time still flows left-to-right and "now" is still on the right, so the axis
 * reads the way every other chart on the board reads. Only the SPACING
 * changes. That matters: an axis that also reversed direction would be a new
 * thing to learn, not a better view of a familiar one.
 *
 * What this deliberately does NOT do is resample or average. Every point the
 * query returned is still plotted at its true date; the old ones simply sit
 * closer together. Compressing the axis is a claim about attention. Averaging
 * the data would be a claim about the data, and a chart that quietly smoothed
 * away a one-day collapse three months back would be lying about history.
 */

/** Tick ladder, in days. Only the entries inside the range get drawn. */
const TICKS = [
  { days: 0, label: 'now' },
  { days: 1, label: '1d' },
  { days: 3, label: '3d' },
  { days: 7, label: '1w' },
  { days: 14, label: '2w' },
  { days: 30, label: '1mo' },
  { days: 60, label: '2mo' },
  { days: 90, label: '3mo' },
  { days: 180, label: '6mo' },
  { days: 365, label: '1y' },
  { days: 730, label: '2y' },
]

const DAY_MS = 86400000

/** Whole days between `date` and `now`. Never negative — a clock-skewed
 *  future timestamp is treated as "now" rather than plotted off the axis. */
export function ageInDays(date, now = Date.now()) {
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, (now - t) / DAY_MS)
}

/**
 * Build a scale over a given history depth.
 *
 * @param maxAgeDays  age at the left edge; the oldest point you want visible
 * @param mode        'log' compresses with age, 'linear' is the plain axis.
 *                    Both are offered so the view can toggle between them and
 *                    the reader can confirm the shape is the same data.
 */
export function timeScale(maxAgeDays, mode = 'log') {
  const max = Math.max(1, Number(maxAgeDays) || 1)
  const denom = Math.log1p(max)

  /** age in days -> 0..1 across the axis (1 = now, right edge) */
  function toX(age) {
    const a = Math.min(Math.max(Number(age) || 0, 0), max)
    if (mode === 'linear') return 1 - a / max
    return 1 - Math.log1p(a) / denom
  }

  /** 0..1 back to age in days — for tooltips and hit-testing. */
  function toAge(x) {
    const u = Math.min(Math.max(Number(x) || 0, 0), 1)
    if (mode === 'linear') return (1 - u) * max
    return Math.expm1((1 - u) * denom)
  }

  /**
   * Axis ticks as { x, label, days }, oldest first.
   *
   * Ticks are labelled by AGE ("2w"), not by date. On a compressed axis a date
   * label invites you to read distance as elapsed time, which is exactly the
   * thing that is no longer true; an age label says plainly what the position
   * encodes. Exact dates still appear in the tooltip, where one point is being
   * read at a time and there is no spacing to misread.
   */
  function ticks() {
    const out = TICKS.filter(t => t.days <= max).map(t => ({ ...t, x: toX(t.days) }))
    // Always anchor the left edge, so the reader can see how deep the tail
    // goes even when maxAge falls between two rungs of the ladder.
    if (!out.some(t => Math.abs(t.days - max) < 0.5)) {
      out.push({ days: max, label: labelForDays(max), x: 0 })
    }
    return out.sort((a, b) => a.x - b.x)
  }

  return { mode, maxAgeDays: max, toX, toAge, ticks }
}

/** Compact age label: "3d", "2w", "5mo", "1.5y". */
export function labelForDays(days) {
  const d = Math.round(Number(days) || 0)
  if (d <= 0) return 'now'
  if (d < 14) return `${d}d`
  if (d < 60) return `${Math.round(d / 7)}w`
  if (d < 365) return `${Math.round(d / 30)}mo`
  const years = d / 365
  return `${years < 10 ? years.toFixed(1).replace(/\.0$/, '') : Math.round(years)}y`
}

/**
 * Project dated rows onto the scale.
 *
 * Returns [{ x, y, date, age, row }] with unusable rows dropped rather than
 * coerced: a null score is not zero, and plotting it as zero would draw a
 * cliff the fleet never had.
 */
export function projectSeries(rows, { dateKey = 'score_date', valueKey = 'composite', scale, now = Date.now() } = {}) {
  if (!scale) throw new Error('projectSeries needs a scale from timeScale()')
  const out = []
  for (const row of rows ?? []) {
    const age = ageInDays(row?.[dateKey], now)
    if (age == null || age > scale.maxAgeDays) continue
    const v = row?.[valueKey]
    if (v == null || !Number.isFinite(Number(v))) continue
    out.push({ x: scale.toX(age), y: Number(v), date: row[dateKey], age, row })
  }
  return out.sort((a, b) => a.x - b.x)
}
