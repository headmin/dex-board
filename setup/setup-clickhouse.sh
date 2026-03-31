#!/bin/bash
# DEX Board — ClickHouse Cloud schema setup
#
# Applies all SQL migrations to a ClickHouse Cloud instance.
# Reads connection details from .env, 1Password, or args.
#
# Usage:
#   bash setup/setup-clickhouse.sh                          # from .env
#   bash setup/setup-clickhouse.sh --op-item "dex-board"    # from 1Password
#   bash setup/setup-clickhouse.sh --url https://... --password secret

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_DIR="$SCRIPT_DIR/clickhouse-schema"

# ── Defaults ─────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env"
OP_ITEM=""

# ── Parse args ───────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)   ENV_FILE="$2"; shift 2 ;;
    --op-item)    OP_ITEM="$2"; shift 2 ;;
    --url)        CLICKHOUSE_URL="$2"; shift 2 ;;
    --user)       CLICKHOUSE_USER="$2"; shift 2 ;;
    --password)   CLICKHOUSE_PASSWORD="$2"; shift 2 ;;
    --database)   CLICKHOUSE_DATABASE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: bash setup/setup-clickhouse.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --env-file FILE    Load connection from FILE (default: .env)"
      echo "  --op-item ITEM     Load connection from 1Password item"
      echo "  --url URL          ClickHouse HTTPS URL"
      echo "  --user USER        ClickHouse user (default: default)"
      echo "  --password PASS    ClickHouse password"
      echo "  --database DB      Database name (default: fleet_logs)"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Load config if not set via args ──────────────────
if [[ -z "$CLICKHOUSE_URL" ]]; then
  if [[ -n "$OP_ITEM" ]]; then
    echo "Loading connection from 1Password item: $OP_ITEM"
    CLICKHOUSE_URL="$(op read "op://$OP_ITEM/CLICKHOUSE_URL" 2>/dev/null || echo "")"
    CLICKHOUSE_USER="$(op read "op://$OP_ITEM/CLICKHOUSE_USER" 2>/dev/null || echo "default")"
    CLICKHOUSE_PASSWORD="$(op read "op://$OP_ITEM/CLICKHOUSE_PASSWORD" 2>/dev/null || echo "")"
    CLICKHOUSE_DATABASE="$(op read "op://$OP_ITEM/CLICKHOUSE_DATABASE" 2>/dev/null || echo "fleet_logs")"
  elif [[ -f "$ENV_FILE" ]]; then
    echo "Loading connection from: $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
  else
    echo "No connection details. Provide --url/--password, --op-item, or create .env"
    echo "See: .env.example"
    exit 1
  fi
fi

# Defaults
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-fleet_logs}"

# Validate
if [[ -z "$CLICKHOUSE_URL" || -z "$CLICKHOUSE_PASSWORD" ]]; then
  echo "ERROR: CLICKHOUSE_URL and CLICKHOUSE_PASSWORD are required"
  exit 1
fi

# ══════════════════════════════════════════════════════
echo ""
echo "DEX Board — ClickHouse Setup"
echo "============================"
echo ""
echo "Host:     $CLICKHOUSE_URL"
echo "User:     $CLICKHOUSE_USER"
echo "Database: $CLICKHOUSE_DATABASE"
echo ""

# ── Run a single SQL statement ───────────────────────
run_statement() {
  local stmt="$1"
  response=$(curl -sS "$CLICKHOUSE_URL" \
    --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
    --data-binary "$stmt" \
    -H "X-ClickHouse-Database: $CLICKHOUSE_DATABASE" \
    -w "\n%{http_code}" \
    2>&1)

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" -ge 400 ]]; then
    echo "    FAILED ($http_code): $body"
    return 1
  fi

  if [[ -n "$body" ]]; then
    echo "    $body"
  fi
}

# ── Apply SQL files in order ─────────────────────────
# Each file is split on semicolons to handle ClickHouse Cloud's
# single-statement-per-request requirement.
for sql_file in "$SCHEMA_DIR"/*.sql; do
  fname=$(basename "$sql_file")
  echo "  Applying $fname..."

  # Split file on semicolons, skip empty/comment-only statements
  while IFS= read -r -d ';' stmt; do
    # Strip leading/trailing whitespace and skip empty
    trimmed=$(echo "$stmt" | sed '/^[[:space:]]*$/d' | sed '/^[[:space:]]*--/d')
    if [[ -z "$trimmed" ]]; then
      continue
    fi
    run_statement "$stmt;" || exit 1
  done < "$sql_file"
done

echo ""
echo "ClickHouse schema applied successfully."
