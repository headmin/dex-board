#!/usr/bin/env bash
# ============================================================
# Create materialized views on the alt ClickHouse instance.
# Sources .alt-env for credentials, runs each SQL statement
# individually via curl.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load alt ClickHouse credentials
ALT_ENV="$PROJECT_DIR/.alt-env"
if [[ ! -f "$ALT_ENV" ]]; then
  echo "ERROR: $ALT_ENV not found. Copy from .env.example and fill in alt ClickHouse credentials."
  exit 1
fi
source "$ALT_ENV"

if [[ -z "${CLICKHOUSE_URL:-}" || -z "${CLICKHOUSE_PASSWORD:-}" ]]; then
  echo "ERROR: CLICKHOUSE_URL and CLICKHOUSE_PASSWORD must be set in .alt-env"
  exit 1
fi

AUTH="${CLICKHOUSE_USER:-default}:${CLICKHOUSE_PASSWORD}"

run_sql() {
  local label="$1"
  local sql="$2"
  echo -n "  $label ... "
  local result
  result=$(curl -s --fail-with-body --user "$AUTH" --data-binary "$sql" "$CLICKHOUSE_URL" 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "FAILED"
    echo "    $result"
    return 1
  fi
  echo "OK ${result:+— $result}"
}

count_table() {
  local table="$1"
  curl -s --user "$AUTH" --data-binary "SELECT count() FROM $table FORMAT TabSeparated" "$CLICKHOUSE_URL"
}

echo "=== Alt ClickHouse: Creating materialized views ==="
echo ""

# ── 1. Wi-Fi Signal Quality ──────────────────────────────
echo "1/11 Wi-Fi Signal Quality"
run_sql "CREATE TABLE wifi_signal" "
CREATE TABLE IF NOT EXISTS wifi_signal (
    host_id        String,
    hostname       String,
    timestamp      DateTime64(9),
    channel        UInt16,
    channel_band   UInt8,
    channel_width  UInt16,
    rssi           Int16,
    noise          Int16,
    snr            Int16,
    signal_quality LowCardinality(String),
    transmit_rate  Float64,
    security_type  LowCardinality(String),
    interface      LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

run_sql "CREATE MV wifi_signal_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS wifi_signal_mv TO wifi_signal AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt16OrZero(JSONExtractString(item, 'channel')) AS channel,
    toUInt8OrZero(JSONExtractString(item, 'channel_band')) AS channel_band,
    toUInt16OrZero(JSONExtractString(item, 'channel_width')) AS channel_width,
    toInt16OrZero(JSONExtractString(item, 'rssi')) AS rssi,
    toInt16OrZero(JSONExtractString(item, 'noise')) AS noise,
    toInt16OrZero(JSONExtractString(item, 'signal_to_noise_ratio')) AS snr,
    JSONExtractString(item, 'signal_quality') AS signal_quality,
    toFloat64OrZero(JSONExtractString(item, 'transmit_rate')) AS transmit_rate,
    JSONExtractString(item, 'security_type') AS security_type,
    JSONExtractString(item, 'interface') AS interface
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Wi-Fi signal quality%'
"

run_sql "BACKFILL wifi_signal" "
INSERT INTO wifi_signal
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt16OrZero(JSONExtractString(item, 'channel')) AS channel,
    toUInt8OrZero(JSONExtractString(item, 'channel_band')) AS channel_band,
    toUInt16OrZero(JSONExtractString(item, 'channel_width')) AS channel_width,
    toInt16OrZero(JSONExtractString(item, 'rssi')) AS rssi,
    toInt16OrZero(JSONExtractString(item, 'noise')) AS noise,
    toInt16OrZero(JSONExtractString(item, 'signal_to_noise_ratio')) AS snr,
    JSONExtractString(item, 'signal_quality') AS signal_quality,
    toFloat64OrZero(JSONExtractString(item, 'transmit_rate')) AS transmit_rate,
    JSONExtractString(item, 'security_type') AS security_type,
    JSONExtractString(item, 'interface') AS interface
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Wi-Fi signal quality%'
"
echo "  → wifi_signal rows: $(count_table wifi_signal)"
echo ""

# ── 2. Running Apps ──────────────────────────────────────
echo "2/11 Running Apps"
run_sql "CREATE TABLE running_apps" "
CREATE TABLE IF NOT EXISTS running_apps (
    host_id           String,
    hostname          String,
    timestamp         DateTime64(9),
    app_name          String,
    bundle_identifier String,
    memory_mb         Float64,
    threads           UInt32,
    pid               UInt32,
    is_active         Int8,
    path              String
) ENGINE = MergeTree() ORDER BY (host_id, timestamp, app_name)
"

run_sql "CREATE MV running_apps_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS running_apps_mv TO running_apps AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'name') AS app_name,
    JSONExtractString(item, 'bundle_identifier') AS bundle_identifier,
    toFloat64OrZero(JSONExtractString(item, 'memory_mb')) AS memory_mb,
    toUInt32OrZero(JSONExtractString(item, 'threads')) AS threads,
    toUInt32OrZero(JSONExtractString(item, 'pid')) AS pid,
    toInt8OrZero(JSONExtractString(item, 'is_active')) AS is_active,
    JSONExtractString(item, 'path') AS path
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%macOS Running Apps%' OR name ILIKE '%macOS running apps%'
"

run_sql "BACKFILL running_apps" "
INSERT INTO running_apps
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'name') AS app_name,
    JSONExtractString(item, 'bundle_identifier') AS bundle_identifier,
    toFloat64OrZero(JSONExtractString(item, 'memory_mb')) AS memory_mb,
    toUInt32OrZero(JSONExtractString(item, 'threads')) AS threads,
    toUInt32OrZero(JSONExtractString(item, 'pid')) AS pid,
    toInt8OrZero(JSONExtractString(item, 'is_active')) AS is_active,
    JSONExtractString(item, 'path') AS path
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%macOS Running Apps%' OR name ILIKE '%macOS running apps%'
"
echo "  → running_apps rows: $(count_table running_apps)"
echo ""

# ── 3. Fleetd Info (from a separate query pack, not dex-queries.yml) ──
echo "3/11 Fleetd Info"
run_sql "CREATE TABLE fleetd_info" "
CREATE TABLE IF NOT EXISTS fleetd_info (
    host_id          String,
    hostname         String,
    timestamp        DateTime64(9),
    version          String,
    desktop_version  String,
    osquery_version  String,
    orbit_channel    LowCardinality(String),
    platform         LowCardinality(String),
    cpu_type         LowCardinality(String),
    uptime_seconds   UInt64,
    enrolled         Bool,
    last_error       String
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

run_sql "CREATE MV fleetd_info_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS fleetd_info_mv TO fleetd_info AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'version') AS version,
    JSONExtractString(item, 'desktop_version') AS desktop_version,
    JSONExtractString(item, 'osquery_version') AS osquery_version,
    JSONExtractString(item, 'orbit_channel') AS orbit_channel,
    JSONExtractString(item, 'platform') AS platform,
    JSONExtractString(item, 'cpu_type') AS cpu_type,
    toUInt64OrZero(JSONExtractString(item, 'uptime')) AS uptime_seconds,
    JSONExtractString(item, 'enrolled') = 'true' AS enrolled,
    JSONExtractString(item, 'last_recorded_error') AS last_error
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%fleetd information%'
"

run_sql "BACKFILL fleetd_info" "
INSERT INTO fleetd_info
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'version') AS version,
    JSONExtractString(item, 'desktop_version') AS desktop_version,
    JSONExtractString(item, 'osquery_version') AS osquery_version,
    JSONExtractString(item, 'orbit_channel') AS orbit_channel,
    JSONExtractString(item, 'platform') AS platform,
    JSONExtractString(item, 'cpu_type') AS cpu_type,
    toUInt64OrZero(JSONExtractString(item, 'uptime')) AS uptime_seconds,
    JSONExtractString(item, 'enrolled') = 'true' AS enrolled,
    JSONExtractString(item, 'last_recorded_error') AS last_error
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%fleetd information%'
"
echo "  → fleetd_info rows: $(count_table fleetd_info)"
echo ""

# ── 4. Hardware Inventory ────────────────────────────────
echo "4/4  Hardware Inventory"
run_sql "CREATE TABLE hardware_inventory" "
CREATE TABLE IF NOT EXISTS hardware_inventory (
    host_id            String,
    hostname           String,
    timestamp          DateTime64(9),
    computer_name      String,
    cpu_brand          LowCardinality(String),
    cpu_logical_cores  UInt8,
    cpu_physical_cores UInt8,
    cpu_type           LowCardinality(String),
    hardware_model     LowCardinality(String),
    hardware_serial    String,
    hardware_vendor    LowCardinality(String),
    memory_gb          Float64
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

run_sql "CREATE MV hardware_inventory_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS hardware_inventory_mv TO hardware_inventory AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'computer_name') AS computer_name,
    JSONExtractString(item, 'cpu_brand') AS cpu_brand,
    toUInt8OrZero(JSONExtractString(item, 'cpu_logical_cores')) AS cpu_logical_cores,
    toUInt8OrZero(JSONExtractString(item, 'cpu_physical_cores')) AS cpu_physical_cores,
    JSONExtractString(item, 'cpu_type') AS cpu_type,
    JSONExtractString(item, 'hardware_model') AS hardware_model,
    JSONExtractString(item, 'hardware_serial') AS hardware_serial,
    JSONExtractString(item, 'hardware_vendor') AS hardware_vendor,
    toFloat64OrZero(JSONExtractString(item, 'memory_gb')) AS memory_gb
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System Information%' OR name ILIKE '%system information%'
"

run_sql "BACKFILL hardware_inventory" "
INSERT INTO hardware_inventory
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'computer_name') AS computer_name,
    JSONExtractString(item, 'cpu_brand') AS cpu_brand,
    toUInt8OrZero(JSONExtractString(item, 'cpu_logical_cores')) AS cpu_logical_cores,
    toUInt8OrZero(JSONExtractString(item, 'cpu_physical_cores')) AS cpu_physical_cores,
    JSONExtractString(item, 'cpu_type') AS cpu_type,
    JSONExtractString(item, 'hardware_model') AS hardware_model,
    JSONExtractString(item, 'hardware_serial') AS hardware_serial,
    JSONExtractString(item, 'hardware_vendor') AS hardware_vendor,
    toFloat64OrZero(JSONExtractString(item, 'memory_gb')) AS memory_gb
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System Information%' OR name ILIKE '%system information%'
"
echo "  → hardware_inventory rows: $(count_table hardware_inventory)"
echo ""

# ── 5. Device Health (Hardware experience) ───────────────
echo "5/11 Device Health"
run_sql "CREATE TABLE device_health" "
CREATE TABLE IF NOT EXISTS device_health (
    host_id                     String,
    hostname                    String,
    timestamp                   DateTime64(9),
    hardware_model              LowCardinality(String),
    hardware_serial             String,
    cpu_brand                   LowCardinality(String),
    cpu_class                   LowCardinality(String),
    cpu_cores                   UInt8,
    logical_processors          UInt8,
    ram_gb                      Float64,
    ram_tier                    LowCardinality(String),
    swap_pressure               LowCardinality(String),
    compression_pressure        LowCardinality(String),
    battery_percent             Int16,
    battery_cycles              UInt32,
    battery_state               LowCardinality(String),
    battery_charging            Int8,
    battery_minutes_remaining   Int32,
    battery_health_pct          Float64,
    battery_health_score        LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

DEVICE_HEALTH_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'hardware_model') AS hardware_model,
    JSONExtractString(item, 'hardware_serial') AS hardware_serial,
    JSONExtractString(item, 'cpu_brand') AS cpu_brand,
    JSONExtractString(item, 'cpu_class') AS cpu_class,
    toUInt8OrZero(JSONExtractString(item, 'cpu_cores')) AS cpu_cores,
    toUInt8OrZero(JSONExtractString(item, 'logical_processors')) AS logical_processors,
    toFloat64OrZero(JSONExtractString(item, 'ram_gb')) AS ram_gb,
    JSONExtractString(item, 'ram_tier') AS ram_tier,
    JSONExtractString(item, 'swap_pressure') AS swap_pressure,
    JSONExtractString(item, 'compression_pressure') AS compression_pressure,
    toInt16OrZero(JSONExtractString(item, 'battery_percent')) AS battery_percent,
    toUInt32OrZero(JSONExtractString(item, 'battery_cycles')) AS battery_cycles,
    JSONExtractString(item, 'battery_state') AS battery_state,
    toInt8OrZero(JSONExtractString(item, 'battery_charging')) AS battery_charging,
    toInt32OrZero(JSONExtractString(item, 'battery_minutes_remaining')) AS battery_minutes_remaining,
    toFloat64OrZero(JSONExtractString(item, 'battery_health_pct')) AS battery_health_pct,
    JSONExtractString(item, 'battery_health_score') AS battery_health_score
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Hardware experience - device health%'
"

run_sql "CREATE MV device_health_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS device_health_mv TO device_health AS
$DEVICE_HEALTH_SELECT
"

run_sql "BACKFILL device_health" "
INSERT INTO device_health
$DEVICE_HEALTH_SELECT
"
echo "  → device_health rows: $(count_table device_health)"
echo ""

# ── 6. OS Health (System experience) ─────────────────────
echo "6/11 OS Health"
run_sql "CREATE TABLE os_health" "
CREATE TABLE IF NOT EXISTS os_health (
    host_id         String,
    hostname        String,
    timestamp       DateTime64(9),
    os_name         LowCardinality(String),
    os_version      String,
    os_build        String,
    os_currency     LowCardinality(String),
    uptime_seconds  UInt64,
    uptime_days     Float64,
    uptime_risk     LowCardinality(String),
    crashes_30d     UInt32,
    dex_os_health   LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

OS_HEALTH_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'os_name') AS os_name,
    JSONExtractString(item, 'os_version') AS os_version,
    JSONExtractString(item, 'os_build') AS os_build,
    JSONExtractString(item, 'os_currency') AS os_currency,
    toUInt64OrZero(JSONExtractString(item, 'uptime_seconds')) AS uptime_seconds,
    toFloat64OrZero(JSONExtractString(item, 'uptime_days')) AS uptime_days,
    JSONExtractString(item, 'uptime_risk') AS uptime_risk,
    toUInt32OrZero(JSONExtractString(item, 'crashes_30d')) AS crashes_30d,
    JSONExtractString(item, 'dex_os_health') AS dex_os_health
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System experience - OS health%'
"

run_sql "CREATE MV os_health_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS os_health_mv TO os_health AS
$OS_HEALTH_SELECT
"

run_sql "BACKFILL os_health" "
INSERT INTO os_health
$OS_HEALTH_SELECT
"
echo "  → os_health rows: $(count_table os_health)"
echo ""

# ── 7. Process Health (Application experience) ───────────
echo "7/11 Process Health"
run_sql "CREATE TABLE process_health" "
CREATE TABLE IF NOT EXISTS process_health (
    host_id             String,
    hostname            String,
    timestamp           DateTime64(9),
    process_name        String,
    path                String,
    pid                 UInt32,
    state               LowCardinality(String),
    threads             UInt32,
    rss_mb              Float64,
    vmem_gb             Float64,
    cpu_user_ms         UInt64,
    cpu_sys_ms          UInt64,
    disk_bytes_read     UInt64,
    disk_bytes_written  UInt64,
    process_class       LowCardinality(String),
    mem_pressure        LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp, process_name)
"

PROCESS_HEALTH_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'process_name') AS process_name,
    JSONExtractString(item, 'path') AS path,
    toUInt32OrZero(JSONExtractString(item, 'pid')) AS pid,
    JSONExtractString(item, 'state') AS state,
    toUInt32OrZero(JSONExtractString(item, 'threads')) AS threads,
    toFloat64OrZero(JSONExtractString(item, 'rss_mb')) AS rss_mb,
    toFloat64OrZero(JSONExtractString(item, 'vmem_gb')) AS vmem_gb,
    toUInt64OrZero(JSONExtractString(item, 'cpu_user_ms')) AS cpu_user_ms,
    toUInt64OrZero(JSONExtractString(item, 'cpu_sys_ms')) AS cpu_sys_ms,
    toUInt64OrZero(JSONExtractString(item, 'disk_bytes_read')) AS disk_bytes_read,
    toUInt64OrZero(JSONExtractString(item, 'disk_bytes_written')) AS disk_bytes_written,
    JSONExtractString(item, 'process_class') AS process_class,
    JSONExtractString(item, 'mem_pressure') AS mem_pressure
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Application experience - process health%'
"

run_sql "CREATE MV process_health_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS process_health_mv TO process_health AS
$PROCESS_HEALTH_SELECT
"

run_sql "BACKFILL process_health" "
INSERT INTO process_health
$PROCESS_HEALTH_SELECT
"
echo "  → process_health rows: $(count_table process_health)"
echo ""

# ── 8. VPN Gate (Network experience) ─────────────────────
echo "8/11 VPN Gate"
run_sql "CREATE TABLE vpn_gate" "
CREATE TABLE IF NOT EXISTS vpn_gate (
    host_id             String,
    hostname            String,
    timestamp           DateTime64(9),
    vpn_tunnels_active  UInt32,
    vpn_tunnels_total   UInt32,
    vpn_default_route   UInt32,
    primary_interface   LowCardinality(String),
    primary_active      Int8,
    network_confidence  LowCardinality(String),
    checked_at_epoch    UInt64,
    checked_at_display  String
) ENGINE = MergeTree() ORDER BY (host_id, timestamp)
"

VPN_GATE_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt32OrZero(JSONExtractString(item, 'vpn_tunnels_active')) AS vpn_tunnels_active,
    toUInt32OrZero(JSONExtractString(item, 'vpn_tunnels_total')) AS vpn_tunnels_total,
    toUInt32OrZero(JSONExtractString(item, 'vpn_default_route')) AS vpn_default_route,
    JSONExtractString(item, 'primary_interface') AS primary_interface,
    toInt8OrZero(JSONExtractString(item, 'primary_active')) AS primary_active,
    JSONExtractString(item, 'network_confidence') AS network_confidence,
    toUInt64OrZero(JSONExtractString(item, 'checked_at_epoch')) AS checked_at_epoch,
    JSONExtractString(item, 'checked_at_display') AS checked_at_display
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Network experience - VPN gate%'
"

run_sql "CREATE MV vpn_gate_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS vpn_gate_mv TO vpn_gate AS
$VPN_GATE_SELECT
"

run_sql "BACKFILL vpn_gate" "
INSERT INTO vpn_gate
$VPN_GATE_SELECT
"
echo "  → vpn_gate rows: $(count_table vpn_gate)"
echo ""

# ── 9. Crash Summary (Application experience) ────────────
echo "9/11 Crash Summary"
run_sql "CREATE TABLE crash_summary" "
CREATE TABLE IF NOT EXISTS crash_summary (
    host_id              String,
    hostname             String,
    timestamp            DateTime64(9),
    crashed_identifier   String,
    app_name             String,
    bundle_identifier    String,
    app_version          String,
    crash_count_7d       UInt32,
    last_crash_at        String,
    crash_severity       LowCardinality(String),
    app_match_status     LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp, crashed_identifier)
"

CRASH_SUMMARY_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'crashed_identifier') AS crashed_identifier,
    JSONExtractString(item, 'app_name') AS app_name,
    JSONExtractString(item, 'bundle_identifier') AS bundle_identifier,
    JSONExtractString(item, 'app_version') AS app_version,
    toUInt32OrZero(JSONExtractString(item, 'crash_count_7d')) AS crash_count_7d,
    JSONExtractString(item, 'last_crash_at') AS last_crash_at,
    JSONExtractString(item, 'crash_severity') AS crash_severity,
    JSONExtractString(item, 'app_match_status') AS app_match_status
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Application experience - crash summary%'
"

run_sql "CREATE MV crash_summary_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS crash_summary_mv TO crash_summary AS
$CRASH_SUMMARY_SELECT
"

run_sql "BACKFILL crash_summary" "
INSERT INTO crash_summary
$CRASH_SUMMARY_SELECT
"
echo "  → crash_summary rows: $(count_table crash_summary)"
echo ""

# ── 10. Crash Detail (Application experience) ────────────
echo "10/11 Crash Detail"
run_sql "CREATE TABLE crash_detail" "
CREATE TABLE IF NOT EXISTS crash_detail (
    host_id               String,
    hostname              String,
    timestamp             DateTime64(9),
    crashed_identifier    String,
    app_name              String,
    crash_datetime        String,
    exception_type        LowCardinality(String),
    exception_codes       String,
    responsible           String,
    crashed_process_path  String,
    app_version           String,
    crash_rank            UInt32
) ENGINE = MergeTree() ORDER BY (host_id, timestamp, crashed_identifier)
"

CRASH_DETAIL_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'crashed_identifier') AS crashed_identifier,
    JSONExtractString(item, 'app_name') AS app_name,
    JSONExtractString(item, 'crash_datetime') AS crash_datetime,
    JSONExtractString(item, 'exception_type') AS exception_type,
    JSONExtractString(item, 'exception_codes') AS exception_codes,
    JSONExtractString(item, 'responsible') AS responsible,
    JSONExtractString(item, 'crashed_process_path') AS crashed_process_path,
    JSONExtractString(item, 'app_version') AS app_version,
    toUInt32OrZero(JSONExtractString(item, 'crash_rank')) AS crash_rank
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Application experience - crash detail%'
"

run_sql "CREATE MV crash_detail_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS crash_detail_mv TO crash_detail AS
$CRASH_DETAIL_SELECT
"

run_sql "BACKFILL crash_detail" "
INSERT INTO crash_detail
$CRASH_DETAIL_SELECT
"
echo "  → crash_detail rows: $(count_table crash_detail)"
echo ""

# ── 11. Adoption Gap (Application experience) ────────────
echo "11/11 Adoption Gap"
run_sql "CREATE TABLE adoption_gap" "
CREATE TABLE IF NOT EXISTS adoption_gap (
    host_id             String,
    hostname            String,
    timestamp           DateTime64(9),
    app_name            String,
    bundle_identifier   String,
    version             String,
    category            LowCardinality(String),
    path                String,
    days_since_opened   Float64,
    usage_tier          LowCardinality(String)
) ENGINE = MergeTree() ORDER BY (host_id, timestamp, bundle_identifier)
"

ADOPTION_GAP_SELECT="
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'app_name') AS app_name,
    JSONExtractString(item, 'bundle_identifier') AS bundle_identifier,
    JSONExtractString(item, 'version') AS version,
    JSONExtractString(item, 'category') AS category,
    JSONExtractString(item, 'path') AS path,
    toFloat64OrZero(JSONExtractString(item, 'days_since_opened')) AS days_since_opened,
    JSONExtractString(item, 'usage_tier') AS usage_tier
FROM \`s3-625dcbb6-7804-4672-8d83-c621b10a4679\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Application experience - adoption gap%'
"

run_sql "CREATE MV adoption_gap_mv" "
CREATE MATERIALIZED VIEW IF NOT EXISTS adoption_gap_mv TO adoption_gap AS
$ADOPTION_GAP_SELECT
"

run_sql "BACKFILL adoption_gap" "
INSERT INTO adoption_gap
$ADOPTION_GAP_SELECT
"
echo "  → adoption_gap rows: $(count_table adoption_gap)"
echo ""

# ── Summary ──────────────────────────────────────────────
echo "=== Done! ==="
echo ""
echo "Tables created:"
echo "  wifi_signal         $(count_table wifi_signal) rows"
echo "  running_apps        $(count_table running_apps) rows"
echo "  fleetd_info         $(count_table fleetd_info) rows"
echo "  hardware_inventory  $(count_table hardware_inventory) rows"
echo "  device_health       $(count_table device_health) rows"
echo "  os_health           $(count_table os_health) rows"
echo "  process_health      $(count_table process_health) rows"
echo "  vpn_gate            $(count_table vpn_gate) rows"
echo "  crash_summary       $(count_table crash_summary) rows"
echo "  crash_detail        $(count_table crash_detail) rows"
echo "  adoption_gap        $(count_table adoption_gap) rows"
echo ""
echo "Materialized views active — new S3 ClickPipe inserts will auto-transform."
