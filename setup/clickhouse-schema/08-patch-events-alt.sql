-- =============================================================================
-- Patch Events on the ALT (firehose) instance.
--
-- Why here and not on main:
--   adoption_gap (the per-host app-version timeline that feeds this table) lives
--   on ALT via the S3 ClickPipes. ClickHouse Cloud doesn't allow cross-cluster
--   INSERTs, so the patch-events log must be on the same instance as its source.
--
-- Engine choice: ReplacingMergeTree with event_time as the version column and
--   ORDER BY (host_identifier, software_name, new_version) as the dedup key.
--   Re-running the ingestion (09-patch-events-ingest.sql) over an overlapping
--   window is idempotent — each (host, software, target-version) collapses to
--   one row at merge time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS default.dex_patch_events (
    event_time            DateTime64(3),
    host_identifier       String,
    hostname              String,
    patch_type            LowCardinality(String),  -- 'os' | 'app'
    software_name         String,
    old_version           String,
    new_version           String,
    patch_available_date  DateTime,                 -- when first host in fleet got this version
    patch_applied_date    DateTime,                 -- when this host got it
    days_to_patch         Float32                   -- gap in days (fleet-relative)
) ENGINE = ReplacingMergeTree(event_time)
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, software_name, new_version)
TTL toDateTime(event_time) + INTERVAL 180 DAY;

SELECT 'default.dex_patch_events ready on ALT instance' AS message;
