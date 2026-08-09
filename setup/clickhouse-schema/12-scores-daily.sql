-- =============================================================================
-- Persisted daily score history on the ALT (firehose) instance.
--
-- Written by the Worker, NOT by a ClickHouse materialized view — that is a
-- deliberate architecture decision. An MV would need its own copy of the
-- scoring formula, which is exactly how 06-score-materialized-views.sql
-- became a silently divergent second implementation (deleted 2026-08-09).
-- Instead the Worker's cron trigger (wrangler.toml [triggers], handler in
-- src/worker/snapshot.ts) runs INSERT ... SELECT assembled at runtime from
-- the same DEVICE_SCORES_CTE constant every read query uses. One formula.
--
-- One row per (day, platform): platform 'all' is the fleet-wide aggregate,
-- plus one row per scoring platform ('macos', 'windows', ...). Category
-- columns are Nullable — a platform that can't measure a category persists
-- NULL, same as the live queries.
--
-- ReplacingMergeTree keyed (platform, score_date), versioned by inserted_at:
-- re-running a day (cron retry, manual backfill via POST /api/snapshot)
-- overwrites instead of duplicating. Read with FINAL.
--
-- Consumers: the Experience hero sparkline and the GitOps daily score series
-- (whose judgment window was previously walled at 30 days of query-time
-- time travel and now extends as far as history exists).
-- =============================================================================

CREATE TABLE IF NOT EXISTS default.dex_scores_daily (
    score_date     Date,
    platform       LowCardinality(String),   -- 'all' | 'macos' | 'windows' | ...
    device_count   UInt32,
    composite      Float32,
    device_health  Nullable(Float32),
    performance    Nullable(Float32),
    network        Nullable(Float32),
    security       Nullable(Float32),
    software       Nullable(Float32),
    inserted_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(inserted_at)
ORDER BY (platform, score_date);
