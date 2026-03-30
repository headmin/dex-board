# Setup

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Fleet](https://fleetdm.com) instance with ClickHouse logging enabled
- [ClickHouse](https://clickhouse.com) instance (Cloud or self-hosted)
- [Cloudflare](https://cloudflare.com) account (free tier works)

## 1. ClickHouse schema

Apply the schema to your ClickHouse instance:

```bash
bash setup/bootstrap.sh --skip-fleet
```

This creates the following tables in `fleet_logs`:

| Table | Purpose |
|---|---|
| `osquery_status_logs` | Agent health and errors |
| `osquery_result_logs` | Scheduled query results |
| `fleet_audit_logs` | Admin activity |
| `dex_scores` | Experience score aggregations |
| `dex_devices` | Device inventory snapshots |

Plus materialized views for real-time score computation.

## 2. Fleet query packs

Load the DEX query packs into Fleet:

```bash
bash setup/bootstrap.sh --skip-clickhouse
```

Query packs by platform:

- **macOS** — Device health, security posture, WiFi quality, app inventory
- **Linux** — Device health, security, disk info
- **Windows** — Device health, security, disk info
- **Cross-platform** — Top processes, hardware info, browser extensions

## 3. Cloudflare Worker

```bash
# Install dependencies
npm install

# Set secrets
bash setup-secrets.sh

# Deploy
bash deploy.sh
```

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `CLICKHOUSE_URL` | `[vars]` / CF console | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USER` | `[vars]` / CF console | ClickHouse username |
| `CLICKHOUSE_DATABASE` | `[vars]` / CF console | Database name |
| `CLICKHOUSE_PASSWORD` | Secret | ClickHouse password |
| `CF_ACCESS_TEAM_DOMAIN` | `[vars]` / CF console | Cloudflare Access team domain |
| `CF_ACCESS_AUD` | Secret | Access application audience tag |

## 4. Local development

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
