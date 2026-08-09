/**
 * Daily score snapshot — persists the fleet's score history.
 *
 * Runs from the Worker's cron trigger (wrangler.toml [triggers]) and writes
 * one row per (day, platform) into default.dex_scores_daily on the firehose
 * instance. The SELECT half of the INSERT is assembled at runtime from the
 * SAME DEVICE_SCORES_CTE constant every read query uses — the persisted
 * history cannot diverge from the live formula the way a hand-copied
 * ClickHouse MV could (see the deleted 06-score-materialized-views.sql for
 * how that ends).
 *
 * Idempotent: the target is ReplacingMergeTree keyed (platform, score_date)
 * with inserted_at as the version column, so re-running a day overwrites it.
 *
 * History serves two consumers:
 *   - the Experience hero sparkline (1 query instead of 30 as-of queries)
 *   - the GitOps score series, whose judgment window was walled at 30 days
 *     of query-time time travel and now extends as far as history exists.
 */
import type { Env } from './types'
import { executeCoreCommand } from './clickhouse-client'
import { DEVICE_SCORES_CTE, SNAPSHOT_PARAMS } from './queries/core-scores'

const INSERT_COLUMNS =
  '(score_date, platform, device_count, composite, device_health, performance, network, security, software)'

/** One fleet-wide row + one row per platform, for a single as-of day. */
const SNAPSHOT_SELECT = `
SELECT
  today() - {asOfDaysAgo:UInt32} AS score_date,
  'all' AS platform,
  toUInt32(count()) AS device_count,
  round(avg(composite_score), 1) AS composite,
  round(avg(device_health_score), 1) AS device_health,
  round(avg(performance_score), 1) AS performance,
  round(avg(network_score), 1) AS network,
  round(avg(security_score), 1) AS security,
  round(avg(software_score), 1) AS software
FROM scored
UNION ALL
SELECT
  today() - {asOfDaysAgo:UInt32} AS score_date,
  platform,
  toUInt32(count()) AS device_count,
  round(avg(composite_score), 1) AS composite,
  round(avg(device_health_score), 1) AS device_health,
  round(avg(performance_score), 1) AS performance,
  round(avg(network_score), 1) AS network,
  round(avg(security_score), 1) AS security,
  round(avg(software_score), 1) AS software
FROM scored
GROUP BY platform`

/**
 * Snapshot one day. asOfDaysAgo = 0 is the cron's daily call; the backfill
 * script calls this endpoint-less via the same SQL with N > 0.
 */
export async function runDailyScoreSnapshot(env: Env, asOfDaysAgo = 0): Promise<void> {
  const sql = `INSERT INTO dex_scores_daily ${INSERT_COLUMNS}\n${DEVICE_SCORES_CTE}\n${SNAPSHOT_SELECT}`
  await executeCoreCommand(sql, { ...SNAPSHOT_PARAMS, asOfDaysAgo }, env)
}
