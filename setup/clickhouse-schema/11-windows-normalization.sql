-- =============================================================================
-- Windows telemetry normalization on the ALT (firehose) instance.
--
-- The Windows DEX pack emits ~15 narrow fact queries (BitLocker, Security
-- Center, Secure Boot, TPM, Windows Update, BSOD, app crashes, installed
-- apps, reboot frequency). Their names never match the macOS-oriented MV
-- filters, so until now every one of these streams landed ONLY in the raw
-- ClickPipe table — fresh, rich, and invisible to the dashboard.
--
-- This file is the normalization wedge of the Windows plan
-- (neutral contract → server-side normalization → coverage-aware scoring):
-- one narrow table + streaming MV per source query, plus a joined
-- `windows_security_posture` view exposing latest posture per host.
--
-- Deliberately NOT done here: inserting into the macOS-shaped
-- security_posture table. Its consumers assume macOS semantics (SIP,
-- Gatekeeper); mixing platforms there would misreport Windows hosts as
-- non-compliant on signals they can't have. Scoring integration is a
-- separate, coverage-aware step.
--
-- Conventions (match setup-clickhouse-firehose.sh):
--   host_id = hostIdentifier, hostname = decorations.hostname,
--   timestamp = calendarTime, rows exploded via
--   ARRAY JOIN JSONExtractArrayRaw(snapshot).
-- MVs only see rows arriving after creation, so applying this file must be
-- followed by a one-time backfill per stream over the raw history:
--   INSERT INTO <table> <the MV's SELECT>
-- Backfills are NOT in this file on purpose: the tables are plain MergeTree,
-- so re-running an INSERT duplicates rows. Only backfill an empty table.
-- =============================================================================

-- ── 1. BitLocker (disk encryption) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_bitlocker (
    host_id            String,
    hostname           String,
    timestamp          DateTime64(9),
    drive_letter       String,
    protection_status  UInt8,
    encryption_method  String,
    conversion_status  String
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_bitlocker_mv TO default.win_bitlocker AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'drive_letter') AS drive_letter,
    toUInt8OrZero(JSONExtractString(item, 'protection_status')) AS protection_status,
    JSONExtractString(item, 'encryption_method') AS encryption_method,
    JSONExtractString(item, 'conversion_status') AS conversion_status
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows BitLocker status%';

-- ── 2. Security Center health (firewall / antivirus / UAC …) ────────────────
-- Values are Security Center health strings: 'Good' / 'Poor' / 'Snoozed' …
CREATE TABLE IF NOT EXISTS default.win_security_center (
    host_id                          String,
    hostname                         String,
    timestamp                        DateTime64(9),
    firewall                         LowCardinality(String),
    antivirus                        LowCardinality(String),
    antispyware                      LowCardinality(String),
    autoupdate                       LowCardinality(String),
    user_account_control             LowCardinality(String),
    windows_security_center_service  LowCardinality(String)
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_security_center_mv TO default.win_security_center AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'firewall') AS firewall,
    JSONExtractString(item, 'antivirus') AS antivirus,
    JSONExtractString(item, 'antispyware') AS antispyware,
    JSONExtractString(item, 'autoupdate') AS autoupdate,
    JSONExtractString(item, 'user_account_control') AS user_account_control,
    JSONExtractString(item, 'windows_security_center_service') AS windows_security_center_service
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows firewall status%';

-- ── 3. Secure Boot ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_secure_boot (
    host_id              String,
    hostname             String,
    timestamp            DateTime64(9),
    secure_boot_enabled  UInt8,
    secure_boot_status   LowCardinality(String)
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_secure_boot_mv TO default.win_secure_boot AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt8OrZero(JSONExtractString(item, 'secure_boot_enabled')) AS secure_boot_enabled,
    JSONExtractString(item, 'secure_boot_status') AS secure_boot_status
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Secure Boot status (Windows)%';

-- ── 4. TPM ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_tpm (
    host_id            String,
    hostname           String,
    timestamp          DateTime64(9),
    activated          UInt8,
    enabled            UInt8,
    owned              UInt8,
    tpm_status         LowCardinality(String),
    spec_version       String,
    manufacturer_name  LowCardinality(String)
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_tpm_mv TO default.win_tpm AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt8OrZero(JSONExtractString(item, 'activated')) AS activated,
    toUInt8OrZero(JSONExtractString(item, 'enabled')) AS enabled,
    toUInt8OrZero(JSONExtractString(item, 'owned')) AS owned,
    JSONExtractString(item, 'tpm_status') AS tpm_status,
    JSONExtractString(item, 'spec_version') AS spec_version,
    JSONExtractString(item, 'manufacturer_name') AS manufacturer_name
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%TPM status (Windows)%';

-- ── 5. Windows Update history ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_updates (
    host_id       String,
    hostname      String,
    timestamp     DateTime64(9),
    title         String,
    operation     LowCardinality(String),
    result_code   LowCardinality(String),
    install_date  DateTime,
    update_status LowCardinality(String)
) ENGINE = MergeTree ORDER BY (host_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_updates_mv TO default.win_updates AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'title') AS title,
    JSONExtractString(item, 'operation') AS operation,
    JSONExtractString(item, 'result_code') AS result_code,
    toDateTime(toInt64OrZero(JSONExtractString(item, 'install_date'))) AS install_date,
    JSONExtractString(item, 'update_status') AS update_status
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows update status%';

-- ── 6. BSOD events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_bsod (
    host_id     String,
    hostname    String,
    timestamp   DateTime64(9),
    event_time  DateTime64(3),
    eventid     LowCardinality(String),
    source      LowCardinality(String),
    error_data  String
) ENGINE = MergeTree ORDER BY (host_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_bsod_mv TO default.win_bsod AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    parseDateTime64BestEffortOrZero(JSONExtractString(item, 'event_time'), 3) AS event_time,
    JSONExtractString(item, 'eventid') AS eventid,
    JSONExtractString(item, 'source') AS source,
    JSONExtractString(item, 'error_data') AS error_data
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows BSOD%';

-- ── 7. Application crashes (WER) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_app_crashes (
    host_id        String,
    hostname       String,
    timestamp      DateTime64(9),
    event_time     DateTime64(3),
    event_type     LowCardinality(String),
    eventid        LowCardinality(String),
    source         LowCardinality(String),
    crash_details  String
) ENGINE = MergeTree ORDER BY (host_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 180 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_app_crashes_mv TO default.win_app_crashes AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    parseDateTime64BestEffortOrZero(JSONExtractString(item, 'event_time'), 3) AS event_time,
    JSONExtractString(item, 'event_type') AS event_type,
    JSONExtractString(item, 'eventid') AS eventid,
    JSONExtractString(item, 'source') AS source,
    JSONExtractString(item, 'crash_details') AS crash_details
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows application crashes%';

-- ── 8. Installed applications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_installed_apps (
    host_id    String,
    hostname   String,
    timestamp  DateTime64(9),
    app_name   String,
    version    String,
    path       String,
    source     LowCardinality(String)
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_installed_apps_mv TO default.win_installed_apps AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'name') AS app_name,
    JSONExtractString(item, 'version') AS version,
    JSONExtractString(item, 'path') AS path,
    JSONExtractString(item, 'source') AS source
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Windows installed applications%';

-- ── 9. Reboot frequency (user sentiment proxy) ───────────────────────────────
CREATE TABLE IF NOT EXISTS default.win_reboots (
    host_id       String,
    hostname      String,
    timestamp     DateTime64(9),
    period        LowCardinality(String),
    reboot_count  UInt32
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.win_reboots_mv TO default.win_reboots AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'period') AS period,
    toUInt32OrZero(JSONExtractString(item, 'reboot_count')) AS reboot_count
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Reboot frequency%';

-- ── 10. Joined latest posture per Windows host ───────────────────────────────
-- The neutral contract for consumers: one row per host, latest state of each
-- posture signal, with per-signal freshness so a stale signal is visible.
CREATE VIEW IF NOT EXISTS default.windows_security_posture AS
SELECT
    b.host_id AS host_id,
    b.hostname AS hostname,
    b.disk_encrypted AS disk_encrypted,
    b.encryption_method AS encryption_method,
    b.last_seen AS bitlocker_last_seen,
    sc.firewall_ok AS firewall_ok,
    sc.antivirus_ok AS antivirus_ok,
    sc.uac_ok AS uac_ok,
    sc.last_seen AS security_center_last_seen,
    sb.secure_boot_enabled AS secure_boot_enabled,
    tpm.tpm_ready AS tpm_ready
FROM (
    SELECT host_id,
        argMax(hostname, timestamp) AS hostname,
        argMax(protection_status, timestamp) AS disk_encrypted,
        argMax(encryption_method, timestamp) AS encryption_method,
        max(timestamp) AS last_seen
    FROM default.win_bitlocker GROUP BY host_id
) b
LEFT JOIN (
    SELECT host_id,
        argMax(firewall, timestamp) = 'Good' AS firewall_ok,
        argMax(antivirus, timestamp) = 'Good' AS antivirus_ok,
        argMax(user_account_control, timestamp) = 'Good' AS uac_ok,
        max(timestamp) AS last_seen
    FROM default.win_security_center GROUP BY host_id
) sc ON b.host_id = sc.host_id
LEFT JOIN (
    SELECT host_id, argMax(secure_boot_enabled, timestamp) AS secure_boot_enabled
    FROM default.win_secure_boot GROUP BY host_id
) sb ON b.host_id = sb.host_id
LEFT JOIN (
    SELECT host_id,
        argMax(activated, timestamp) AND argMax(enabled, timestamp) AS tpm_ready
    FROM default.win_tpm GROUP BY host_id
) tpm ON b.host_id = tpm.host_id;
