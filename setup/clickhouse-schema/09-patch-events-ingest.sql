-- =============================================================================
-- Patch Events ingestion: Refreshable Materialized View on the ALT instance.
--
-- ClickHouse Cloud manages the schedule. Every hour, this MV re-runs the SELECT
-- and writes the result into default.dex_patch_events. Because the target table
-- is ReplacingMergeTree keyed on (host_identifier, software_name, new_version),
-- overlapping refreshes collapse to one row per logical transition.
--
-- Detection logic: scan adoption_gap rows in (host_id, app_name) order; emit a
-- transition whenever `version` changes between consecutive snapshots.
--
-- patch_available_date = min(timestamp) across the fleet for that (app, version)
-- days_to_patch        = days between fleet-first-saw-this-version and this-host-got-it
--
-- Window: 30 days. On first run this backfills 30d; subsequent refreshes
-- re-cover the same window — ReplacingMergeTree dedup makes this idempotent.
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS default.dex_patch_events_refresh
REFRESH EVERY 1 HOUR
TO default.dex_patch_events
AS
WITH
  transitions AS (
    SELECT
      host_id,
      hostname,
      app_name,
      version,
      timestamp,
      lagInFrame(version,   1, '')                            OVER w AS prev_version,
      lagInFrame(timestamp, 1, toDateTime64('1970-01-01', 9)) OVER w AS prev_timestamp
    FROM (
      SELECT host_id, hostname, app_name, version, timestamp
      FROM default.adoption_gap
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND version != ''
    )
    WINDOW w AS (PARTITION BY host_id, app_name ORDER BY timestamp)
  ),
  available_dates AS (    -- fleet-wide: when did the first host get each (app, version)?
    SELECT
      app_name,
      version,
      min(timestamp) AS first_seen
    FROM default.adoption_gap
    WHERE version != ''
    GROUP BY app_name, version
  )
SELECT
  t.timestamp                                            AS event_time,
  t.host_id                                              AS host_identifier,
  t.hostname                                             AS hostname,
  'app'                                                  AS patch_type,
  t.app_name                                             AS software_name,
  t.prev_version                                         AS old_version,
  t.version                                              AS new_version,
  toDateTime(a.first_seen)                                              AS patch_available_date,
  toDateTime(t.timestamp)                                               AS patch_applied_date,
  -- Fractional days at hour precision. Day-precision (dateDiff('day',...))
  -- collapses all transitions within a calendar day to the same integer,
  -- so within a (target, day) cluster every row looks identical. Hour /
  -- 24 keeps the lag varying with the actual apply hour while staying
  -- bounded by the source data's hourly granularity.
  toFloat32(round(dateDiff('hour', a.first_seen, t.timestamp) / 24.0, 2)) AS days_to_patch
FROM transitions t
LEFT JOIN available_dates a
  ON a.app_name = t.app_name AND a.version = t.version
WHERE t.prev_version != ''
  AND t.prev_version != t.version;
