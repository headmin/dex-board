#!/bin/bash
# DEX Board — Bootstrap ClickHouse schema and Fleet query packs
#
# Usage:
#   bash setup/bootstrap.sh                          # interactive prompts
#   bash setup/bootstrap.sh --ch-host localhost       # non-interactive
#
# Prerequisites:
#   - clickhouse-client (or curl for HTTP API)
#   - fleetctl (https://fleetdm.com/resources/install-fleetctl.sh)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Defaults ─────────────────────────────────────────
CH_HOST="${CH_HOST:-localhost}"
CH_PORT="${CH_PORT:-8123}"
CH_USER="${CH_USER:-fleet}"
CH_PASS="${CH_PASS:-fleet}"
CH_DB="${CH_DB:-fleet_logs}"

FLEET_URL="${FLEET_URL:-https://fleeted.macadmin.me}"
FLEET_TOKEN="${FLEET_TOKEN:-}"

# ── Parse args ───────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --ch-host)    CH_HOST="$2"; shift 2 ;;
    --ch-port)    CH_PORT="$2"; shift 2 ;;
    --ch-user)    CH_USER="$2"; shift 2 ;;
    --ch-pass)    CH_PASS="$2"; shift 2 ;;
    --ch-db)      CH_DB="$2"; shift 2 ;;
    --fleet-url)  FLEET_URL="$2"; shift 2 ;;
    --fleet-token) FLEET_TOKEN="$2"; shift 2 ;;
    --skip-clickhouse) SKIP_CH=1; shift ;;
    --skip-fleet) SKIP_FLEET=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "DEX Board — Bootstrap"
echo "====================="
echo ""

# ── ClickHouse schema ────────────────────────────────
if [[ -z "$SKIP_CH" ]]; then
  echo "ClickHouse: ${CH_HOST}:${CH_PORT} (db: ${CH_DB})"
  echo ""

  for sql_file in "$SCRIPT_DIR/clickhouse-schema/"*.sql; do
    fname=$(basename "$sql_file")
    echo "  Applying $fname..."
    curl -sS "http://${CH_HOST}:${CH_PORT}/" \
      --user "${CH_USER}:${CH_PASS}" \
      --data-binary @"$sql_file" \
      || { echo "  FAILED: $fname"; exit 1; }
  done

  echo ""
  echo "ClickHouse schema applied."
  echo ""
fi

# ── Fleet query packs ────────────────────────────────
if [[ -z "$SKIP_FLEET" ]]; then
  if [[ -z "$FLEET_TOKEN" ]]; then
    echo "Fleet: ${FLEET_URL}"
    echo "Provide an API token (Settings > Integrations > API tokens):"
    read -rsp "  Token: " FLEET_TOKEN
    echo ""
  fi

  if ! command -v fleetctl &>/dev/null; then
    echo "fleetctl not found. Install: curl -sSL https://fleetdm.com/resources/install-fleetctl.sh | bash"
    exit 1
  fi

  fleetctl config set --address "$FLEET_URL" --token "$FLEET_TOKEN" --tls-skip-verify 2>/dev/null

  for pack_dir in "$SCRIPT_DIR/fleet-query-packs"/*/; do
    platform=$(basename "$pack_dir")
    pack_file="$pack_dir/dex-queries.yml"
    if [[ -f "$pack_file" ]]; then
      echo "  Loading $platform query pack..."
      fleetctl apply -f "$pack_file" \
        || echo "  WARNING: Failed to apply $platform pack (may need Fleet Premium for some features)"
    fi
  done

  echo ""
  echo "Fleet query packs loaded."
fi

echo ""
echo "Done. Queries will start collecting data on the next osquery check-in."
