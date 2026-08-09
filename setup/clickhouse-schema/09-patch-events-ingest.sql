-- =============================================================================
-- Patch Events ingestion: Refreshable Materialized View on the ALT instance.
--
-- ClickHouse Cloud manages the schedule. Every hour, this MV re-runs the SELECT
-- and writes the result into default.dex_patch_events. Because the target table
-- is ReplacingMergeTree keyed on (host_identifier, software_name, new_version),
-- overlapping refreshes collapse to one row per logical transition.
--
-- A table can be the target of only ONE refreshable MV, so this single MV
-- carries BOTH event kinds via UNION ALL:
--
--   app branch — scan adoption_gap rows in (host_id, app_name) order; emit a
--     transition whenever `version` changes between consecutive snapshots.
--   os branch  — same mechanism over os_health (host_id, os_name), emitted as
--     patch_type = 'os'. This is what feeds the "OS updates vs app updates"
--     split on the Patch velocity page. The os branch has a numeric
--     direction guard (arrays compare element-wise) so a downgrade or
--     re-image never registers as a fast patch; the app branch cannot have
--     one because app version strings aren't reliably numeric (known
--     limitation, tracked in docs/docs/patch-velocity-gaps.md).
--
-- patch_available_date = min(timestamp) across the fleet for that (name, version)
-- days_to_patch        = days between fleet-first-saw-this-version and this-host-got-it
--
-- Window: 30 days. On first run this backfills 30d; subsequent refreshes
-- re-cover the same window — ReplacingMergeTree dedup makes this idempotent.
--
-- To apply a change to this MV on a live instance:
--   DROP VIEW IF EXISTS default.dex_patch_events_refresh;  -- target data survives
--   <run the CREATE below>
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
  AND t.prev_version != t.version

UNION ALL

WITH
  os_transitions AS (
    SELECT
      host_id,
      hostname,
      os_name,
      os_version,
      timestamp,
      lagInFrame(os_version, 1, '')                           OVER w AS prev_version,
      lagInFrame(timestamp, 1, toDateTime64('1970-01-01', 9)) OVER w AS prev_timestamp
    FROM (
      SELECT host_id, hostname, os_name, os_version, timestamp
      FROM default.os_health
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND os_version != ''
    )
    WINDOW w AS (PARTITION BY host_id, os_name ORDER BY timestamp)
  ),
  os_available_dates AS (  -- fleet-wide: when did the first host reach each (os, version)?
    SELECT
      os_name,
      os_version,
      min(timestamp) AS first_seen
    FROM default.os_health
    WHERE os_version != ''
    GROUP BY os_name, os_version
  )
SELECT
  t.timestamp                                             AS event_time,
  t.host_id                                               AS host_identifier,
  t.hostname                                              AS hostname,
  'os'                                                    AS patch_type,
  t.os_name                                               AS software_name,
  t.prev_version                                          AS old_version,
  t.os_version                                            AS new_version,
  toDateTime(a.first_seen)                                AS patch_available_date,
  toDateTime(t.timestamp)                                 AS patch_applied_date,
  toFloat32(round(dateDiff('hour', a.first_seen, t.timestamp) / 24.0, 2)) AS days_to_patch
FROM os_transitions t
LEFT JOIN os_available_dates a
  ON a.os_name = t.os_name AND a.os_version = t.os_version
WHERE t.prev_version != ''
  AND t.prev_version != t.os_version
  -- Numeric direction guard: arrays compare element-wise, so [26,5,2] >
  -- [26,5,1] and [26,0] > [15,7,1]. Downgrades and re-images don't count.
  AND arrayMap(x -> toUInt32OrZero(x), splitByChar('.', t.os_version))
    > arrayMap(x -> toUInt32OrZero(x), splitByChar('.', t.prev_version));
