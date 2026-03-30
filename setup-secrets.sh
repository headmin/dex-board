#!/bin/bash
# DEX Board — Bootstrap Cloudflare Worker variables and secrets
# Run once after first deploy: bash setup-secrets.sh

set -e

export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "DEX Board — Cloudflare Worker setup"
echo "===================================="
echo ""

# Variables (plain text, visible in dashboard)
read -p "ClickHouse URL [https://your-instance.clickhouse.cloud:8443]: " CH_URL
CH_URL="${CH_URL:-https://your-instance.clickhouse.cloud:8443}"

read -p "ClickHouse user [default]: " CH_USER
CH_USER="${CH_USER:-default}"

read -p "ClickHouse database [fleet_logs]: " CH_DB
CH_DB="${CH_DB:-fleet_logs}"

read -p "CF Access team domain (blank to skip): " CF_TEAM
read -p "CF Access AUD tag (blank to skip): " CF_AUD

echo ""
echo "Setting variables..."
npx wrangler secret put CLICKHOUSE_URL <<< "$CH_URL" 2>/dev/null
npx wrangler secret put CLICKHOUSE_USER <<< "$CH_USER" 2>/dev/null
npx wrangler secret put CLICKHOUSE_DATABASE <<< "$CH_DB" 2>/dev/null

[ -n "$CF_TEAM" ] && npx wrangler secret put CF_ACCESS_TEAM_DOMAIN <<< "$CF_TEAM" 2>/dev/null
[ -n "$CF_AUD" ] && npx wrangler secret put CF_ACCESS_AUD <<< "$CF_AUD" 2>/dev/null

# Secrets (sensitive, write-only)
echo ""
echo "Now set the ClickHouse password (input hidden):"
npx wrangler secret put CLICKHOUSE_PASSWORD

echo ""
echo "Done. Verify at: dash.cloudflare.com > Workers & Pages > dex-board > Settings"
