#!/bin/bash
# DEX Board — Push secrets to Cloudflare and deploy worker
#
# Sources:
#   1. .env file (default: .env in project root)
#   2. 1Password via op CLI (--op-item "item-name")
#   3. Interactive prompts (fallback)
#
# Usage:
#   bash setup/deploy.sh                        # from .env file
#   bash setup/deploy.sh --op-item "dex-board"  # from 1Password
#   bash setup/deploy.sh --env-file .env.prod   # custom .env file
#   bash setup/deploy.sh --secrets-only         # push secrets, skip deploy
#   bash setup/deploy.sh --deploy-only          # skip secrets, just deploy

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# nvm
export NVM_DIR="${NVM_DIR:-$HOME/.config/nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ── Defaults ─────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/.env"
OP_ITEM=""
SECRETS_ONLY=0
DEPLOY_ONLY=0

# ── Parse args ───────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)      ENV_FILE="$2"; shift 2 ;;
    --op-item)       OP_ITEM="$2"; shift 2 ;;
    --secrets-only)  SECRETS_ONLY=1; shift ;;
    --deploy-only)   DEPLOY_ONLY=1; shift ;;
    --help|-h)
      echo "Usage: bash setup/deploy.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --env-file FILE    Load secrets from FILE (default: .env)"
      echo "  --op-item ITEM     Load secrets from 1Password item"
      echo "  --secrets-only     Push secrets to CF, skip deploy"
      echo "  --deploy-only      Skip secrets, just build and deploy"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Generate a random password ───────────────────────
generate_password() {
  openssl rand -base64 24 | tr -d '/+=' | head -c 24
}

# ── Load from 1Password ─────────────────────────────
load_from_op() {
  local item="$1"
  echo "Loading secrets from 1Password item: $item"

  CLOUDFLARE_ACCOUNT_ID="$(op read "op://$item/CLOUDFLARE_ACCOUNT_ID" 2>/dev/null || echo "")"
  CLOUDFLARE_API_TOKEN="$(op read "op://$item/CLOUDFLARE_API_TOKEN" 2>/dev/null || echo "")"
  CLICKHOUSE_URL="$(op read "op://$item/CLICKHOUSE_URL" 2>/dev/null || echo "")"
  CLICKHOUSE_USER="$(op read "op://$item/CLICKHOUSE_USER" 2>/dev/null || echo "default")"
  CLICKHOUSE_PASSWORD="$(op read "op://$item/CLICKHOUSE_PASSWORD" 2>/dev/null || echo "")"
  CLICKHOUSE_DATABASE="$(op read "op://$item/CLICKHOUSE_DATABASE" 2>/dev/null || echo "fleet_logs")"
  BASIC_AUTH_USER="$(op read "op://$item/BASIC_AUTH_USER" 2>/dev/null || echo "")"
  BASIC_AUTH_PASS="$(op read "op://$item/BASIC_AUTH_PASS" 2>/dev/null || echo "")"
  CF_ACCESS_TEAM_DOMAIN="$(op read "op://$item/CF_ACCESS_TEAM_DOMAIN" 2>/dev/null || echo "")"
  CF_ACCESS_AUD="$(op read "op://$item/CF_ACCESS_AUD" 2>/dev/null || echo "")"
}

# ── Load from .env file ─────────────────────────────
load_from_env() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "No .env file found at: $file"
    echo "Copy .env.example to .env and fill in values, or use --op-item"
    exit 1
  fi
  echo "Loading secrets from: $file"
  set -a
  source "$file"
  set +a
}

# ── Push a single secret to CF ───────────────────────
put_secret() {
  local name="$1" value="$2"
  if [[ -n "$value" ]]; then
    echo "  Setting $name..."
    printf '%s' "$value" | npx wrangler secret put "$name" --name dex-board 2>&1
  fi
}

# ══════════════════════════════════════════════════════
echo ""
echo "DEX Board — Cloudflare Deploy"
echo "============================="
echo ""

cd "$PROJECT_DIR"

# ── Load config ──────────────────────────────────────
if [[ -n "$OP_ITEM" ]]; then
  load_from_op "$OP_ITEM"
else
  load_from_env "$ENV_FILE"
fi

# Validate Cloudflare auth
if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is required in .env"
  exit 1
fi
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

# Validate required
if [[ -z "$CLICKHOUSE_URL" || -z "$CLICKHOUSE_PASSWORD" ]]; then
  echo "ERROR: CLICKHOUSE_URL and CLICKHOUSE_PASSWORD are required"
  exit 1
fi

# Generate basic auth password if user is set but password is empty
if [[ -n "$BASIC_AUTH_USER" && -z "$BASIC_AUTH_PASS" ]]; then
  BASIC_AUTH_PASS="$(generate_password)"
  echo ""
  echo "Generated BASIC_AUTH_PASS: $BASIC_AUTH_PASS"
  echo "(save this — it won't be shown again)"
  echo ""
fi

# ── Deploy first (clears old [vars] bindings) ────────
if [[ $SECRETS_ONLY -eq 0 ]]; then
  echo "Building and deploying..."
  npm run deploy
  echo ""
fi

# ── Push secrets ─────────────────────────────────────
if [[ $DEPLOY_ONLY -eq 0 ]]; then
  echo "Pushing secrets to Cloudflare..."
  put_secret "CLICKHOUSE_URL" "$CLICKHOUSE_URL"
  put_secret "CLICKHOUSE_USER" "$CLICKHOUSE_USER"
  put_secret "CLICKHOUSE_PASSWORD" "$CLICKHOUSE_PASSWORD"
  put_secret "CLICKHOUSE_DATABASE" "$CLICKHOUSE_DATABASE"
  put_secret "BASIC_AUTH_USER" "$BASIC_AUTH_USER"
  put_secret "BASIC_AUTH_PASS" "$BASIC_AUTH_PASS"
  put_secret "CF_ACCESS_TEAM_DOMAIN" "$CF_ACCESS_TEAM_DOMAIN"
  put_secret "CF_ACCESS_AUD" "$CF_ACCESS_AUD"
  echo ""
  echo "Secrets pushed."
fi

echo ""
echo "Done."
