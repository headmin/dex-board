#!/bin/bash
# DEX Board — Build and deploy docs to Cloudflare Workers
#
# Usage:
#   bash setup/deploy-docs.sh              # build + deploy
#   bash setup/deploy-docs.sh --build-only # just build, no deploy

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$PROJECT_DIR/docs"

BUILD_ONLY=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --build-only) BUILD_ONLY=1; shift ;;
    --help|-h)
      echo "Usage: bash setup/deploy-docs.sh [--build-only]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# nvm (for wrangler)
export NVM_DIR="${NVM_DIR:-$HOME/.config/nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Load .env for Cloudflare auth
if [[ -f "$PROJECT_DIR/.env" ]]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
  export CLOUDFLARE_API_TOKEN
  export CLOUDFLARE_ACCOUNT_ID
fi

echo ""
echo "DEX Board — Docs Deploy"
echo "======================="
echo ""

# Build
echo "Building docs..."
cd "$DOCS_DIR"
uv run zensical build
echo ""

if [[ $BUILD_ONLY -eq 1 ]]; then
  echo "Build complete: $DOCS_DIR/site/"
  exit 0
fi

# Deploy as Cloudflare Worker (static assets)
echo "Deploying to Cloudflare Workers..."
npx wrangler deploy --config "$DOCS_DIR/wrangler.toml"

echo ""
echo "Done."
