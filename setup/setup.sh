#!/usr/bin/env bash
# ============================================================
# DEX Board — one-shot bootstrap orchestrator.
#
# Runs the full pipeline from clone → deployed worker:
#   1. Fleet-logs ClickHouse schema    (setup-clickhouse.sh)
#   2. Firehose ClickHouse schema + MVs (setup-clickhouse-firehose.sh)
#   3. Push secrets to Cloudflare       (deploy.sh --secrets-only)
#   4. Build + deploy worker            (deploy.sh --deploy-only)
#
# Each phase is idempotent. The firehose-backfill step is skipped
# on re-runs by default (override with --backfill).
#
# Usage:
#   bash setup/setup.sh                       # full bootstrap
#   bash setup/setup.sh --deploy-only         # just rebuild + redeploy worker
#   bash setup/setup.sh --schema-only         # just run ClickHouse DDL on both instances
#   bash setup/setup.sh --secrets-only        # just push secrets
#   bash setup/setup.sh --op-item dex-board   # source secrets from 1Password
#   bash setup/setup.sh --env-file .env.prod  # custom env file
#   bash setup/setup.sh --backfill            # include firehose backfill (default: skip)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Defaults ─────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env"
OP_ITEM=""
MODE="full"           # full | deploy-only | schema-only | secrets-only
BACKFILL=0            # firehose backfill is opt-in (re-runs are common)

# ── Parse args ───────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)     ENV_FILE="$2"; shift 2 ;;
    --op-item)      OP_ITEM="$2"; shift 2 ;;
    --deploy-only)  MODE="deploy-only"; shift ;;
    --schema-only)  MODE="schema-only"; shift ;;
    --secrets-only) MODE="secrets-only"; shift ;;
    --backfill)     BACKFILL=1; shift ;;
    -h|--help)      sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo ""
echo "DEX Board — Bootstrap (mode: $MODE)"
echo "===================================="
echo ""

# Build flag forwarding for child scripts
common_args=()
if [[ -n "$OP_ITEM" ]]; then
  common_args+=(--op-item "$OP_ITEM")
else
  common_args+=(--env-file "$ENV_FILE")
fi

phase() {
  echo ""
  echo "▶ $1"
  echo "────────────────────────────────────────────────────────"
}

# ── Phase 1: Fleet-logs ClickHouse schema ────────────
if [[ "$MODE" == "full" || "$MODE" == "schema-only" ]]; then
  phase "Phase 1/4: Fleet-logs ClickHouse schema"
  bash "$SCRIPT_DIR/setup-clickhouse.sh" "${common_args[@]}"
fi

# ── Phase 2: Firehose ClickHouse schema + MVs ────────
if [[ "$MODE" == "full" || "$MODE" == "schema-only" ]]; then
  phase "Phase 2/4: Firehose ClickHouse schema + materialized views"
  firehose_args=(--env-file "$ENV_FILE")
  [[ $BACKFILL -eq 0 ]] && firehose_args+=(--skip-backfill)
  bash "$SCRIPT_DIR/setup-clickhouse-firehose.sh" "${firehose_args[@]}"
fi

# ── Phase 3: Push secrets to Cloudflare ──────────────
if [[ "$MODE" == "full" || "$MODE" == "secrets-only" ]]; then
  phase "Phase 3/4: Cloudflare secrets"
  bash "$SCRIPT_DIR/deploy.sh" "${common_args[@]}" --secrets-only
fi

# ── Phase 4: Build + deploy worker ───────────────────
if [[ "$MODE" == "full" || "$MODE" == "deploy-only" ]]; then
  phase "Phase 4/4: Build + deploy worker"
  bash "$SCRIPT_DIR/deploy.sh" "${common_args[@]}" --deploy-only
fi

echo ""
echo "✓ Done."
