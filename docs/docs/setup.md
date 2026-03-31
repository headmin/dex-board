# Setup

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Fleet](https://fleetdm.com) instance with ClickHouse logging enabled
- [ClickHouse](https://clickhouse.com) instance (Cloud or self-hosted)
- [Cloudflare](https://cloudflare.com) account (free tier works)

## 1. Configuration

All secrets and connection details are stored in a `.env` file (git-ignored) or in 1Password.

```bash
cp .env.example .env
```

Fill in your values:

```bash
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# ClickHouse
CLICKHOUSE_URL=https://your-instance.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_DATABASE=fleet_logs

# Basic auth (optional — leave empty to disable)
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=

# Cloudflare Access (optional — leave empty to disable)
CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=
```

!!! tip "Cloudflare API token"
    Create a token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with **Edit Cloudflare Workers** permissions. Your account ID is on the Workers & Pages overview page.

### Using 1Password

Both setup scripts support loading secrets from 1Password via the `op` CLI:

```bash
bash setup/setup-clickhouse.sh --op-item "dex-board"
bash setup/deploy.sh --op-item "dex-board"
```

The item should have fields matching the `.env` variable names (e.g. `CLICKHOUSE_URL`, `CLICKHOUSE_PASSWORD`).

## 2. ClickHouse schema

Apply the schema to your ClickHouse instance:

```bash
bash setup/setup-clickhouse.sh
```

This creates the following in the `fleet_logs` database:

| Table | Purpose |
|---|---|
| `osquery_status_logs` | Agent health and errors |
| `osquery_result_logs` | Scheduled query results |
| `fleet_audit_logs` | Admin activity |
| `dex_scores` | Experience score aggregations |
| `dex_devices` | Device inventory snapshots |

Plus materialized views for real-time score computation.

The script reads connection details from `.env` by default. You can also pass them directly:

```bash
bash setup/setup-clickhouse.sh --url https://your-instance.clickhouse.cloud:8443 --password secret
```

## 3. Fleet query packs

Load the DEX query packs into Fleet:

```bash
bash setup/bootstrap.sh --skip-clickhouse
```

Query packs by platform:

- **macOS** — Device health, security posture, WiFi quality, app inventory
- **Linux** — Device health, security, disk info
- **Windows** — Device health, security, disk info
- **Cross-platform** — Top processes, hardware info, browser extensions

## 4. Deploy to Cloudflare

### How `.env`, `wrangler.toml`, and the deploy script work together

DEX Board keeps secrets strictly separated from code:

``` mermaid
graph TD
  A[".env (local, git-ignored)"] -->|read by| B["setup/deploy.sh"]
  B -->|exports| C["CLOUDFLARE_API_TOKEN<br>CLOUDFLARE_ACCOUNT_ID"]
  C -->|authenticates| D["wrangler deploy"]
  B -->|pushes via| E["wrangler secret put"]
  E -->|stored in| F["Cloudflare Workers<br>encrypted secrets"]
  G["wrangler.toml (committed)"] -->|defines| H["Worker name, routes,<br>compatibility flags,<br>asset binding"]
  F -->|available at runtime as| I["env.CLICKHOUSE_URL<br>env.BASIC_AUTH_PASS<br>etc."]
  H -->|configures| D
```

- **`.env`** — Single source of truth for all secrets and connection details. Never committed (`.gitignore`). Used by both `setup/deploy.sh` and `setup/setup-clickhouse.sh`.
- **`wrangler.toml`** — Committed to the repo. Contains only non-sensitive Worker configuration: name, compatibility flags, asset binding, and placement. No `[vars]` section — all config is pushed as encrypted secrets.
- **`setup/deploy.sh`** — Reads `.env` (or 1Password), exports `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for wrangler authentication, runs `npm run deploy` (Vite build + `wrangler deploy`), then pushes each secret to Cloudflare via `wrangler secret put`.
- **`setup/setup-clickhouse.sh`** — Reads `.env` (or 1Password) for ClickHouse connection details and applies the SQL schema files.

!!! warning "Order matters"
    The deploy script deploys the Worker first, then pushes secrets. This is because `wrangler secret put` fails if a variable name collides with a `[vars]` binding in the deployed Worker. By deploying the clean `wrangler.toml` (without `[vars]`) first, the secret push succeeds.

### Running the deploy

The deploy script builds the dashboard, deploys the Worker, and pushes all secrets:

```bash
bash setup/deploy.sh
```

This will:

1. Load secrets from `.env` (or 1Password with `--op-item`)
2. Build the Vue dashboard with Vite
3. Deploy the Worker to Cloudflare
4. Push all secrets to the Worker via `wrangler secret put`

If `BASIC_AUTH_USER` is set but `BASIC_AUTH_PASS` is empty, a random password is generated and printed once.

### Deploy options

```bash
# Full deploy (default): build + deploy + push secrets
bash setup/deploy.sh

# Secrets only (no build/deploy)
bash setup/deploy.sh --secrets-only

# Deploy only (no secret push — use after code changes)
bash setup/deploy.sh --deploy-only

# Custom .env file
bash setup/deploy.sh --env-file .env.prod

# From 1Password
bash setup/deploy.sh --op-item "dex-board"
```

### Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token |
| `CLICKHOUSE_URL` | Yes | ClickHouse HTTP(S) endpoint |
| `CLICKHOUSE_USER` | Yes | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | Yes | ClickHouse password |
| `CLICKHOUSE_DATABASE` | Yes | Database name (default: `fleet_logs`) |
| `BASIC_AUTH_USER` | No | Basic auth username (empty = disabled) |
| `BASIC_AUTH_PASS` | No | Basic auth password (auto-generated if empty) |
| `CF_ACCESS_TEAM_DOMAIN` | No | Cloudflare Access team domain |
| `CF_ACCESS_AUD` | No | Cloudflare Access audience tag |

## 5. Local development

Run the Worker API and Vue dashboard locally:

```bash
# Terminal 1: Worker API on port 8787
npm run dev:worker

# Terminal 2: Vue dashboard on port 5173
npm run dev
```

The Vite dev server proxies `/api` requests to the Worker on port 8787.

Create a `.dev.vars` file for local ClickHouse credentials:

```
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=fleet
CLICKHOUSE_PASSWORD=fleet
CLICKHOUSE_DATABASE=fleet_logs
```
