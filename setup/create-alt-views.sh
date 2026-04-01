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
echo "1/4  Wi-Fi Signal Quality"
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Wi-Fi signal quality%'
"
echo "  → wifi_signal rows: $(count_table wifi_signal)"
echo ""

# ── 2. Running Apps ──────────────────────────────────────
echo "2/4  Running Apps"
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%macOS Running Apps%' OR name ILIKE '%macOS running apps%'
"
echo "  → running_apps rows: $(count_table running_apps)"
echo ""

# ── 3. Fleetd Info ───────────────────────────────────────
echo "3/4  Fleetd Info"
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
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
FROM \`s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2\`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System Information%' OR name ILIKE '%system information%'
"
echo "  → hardware_inventory rows: $(count_table hardware_inventory)"
echo ""

# ── Summary ──────────────────────────────────────────────
echo "=== Done! ==="
echo ""
echo "Tables created:"
echo "  wifi_signal        $(count_table wifi_signal) rows"
echo "  running_apps       $(count_table running_apps) rows"
echo "  fleetd_info        $(count_table fleetd_info) rows"
echo "  hardware_inventory $(count_table hardware_inventory) rows"
echo ""
echo "Materialized views active — new S3 ClickPipe inserts will auto-transform."
