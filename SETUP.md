# DEX Board — Setup

End-to-end guide from `git clone` to a deployed Cloudflare Worker reading from your own ClickHouse + Fleet. Most readers will get there with: fill in `.env`, run `bash setup/setup.sh`.

> This single doc replaces the old `docs/docs/setup.md` and `setup/HOWTO-alt-views.md`. It branches by audience near the end (Fleet teammates vs external deployments).

---

## 1. Prerequisites

| What | Why | How |
|---|---|---|
| `git`, Node 20+, `npm` | Build + clone | system package manager |
| `npx wrangler` | Cloudflare deploys | installed transitively via `npm install` |
| Cloudflare account | Worker host | [dash.cloudflare.com](https://dash.cloudflare.com) — free tier works |
| **Two** ClickHouse Cloud services | Two data lanes (see §2) | [clickhouse.cloud](https://clickhouse.cloud) |
| Fleet server with DEX query packs | Generates the host telemetry | [fleetdm.com](https://fleetdm.com) — see §3 |
| `op` (1Password CLI) | Optional — only used by Fleet teammates pulling shared secrets | [developer.1password.com/docs/cli](https://developer.1password.com/docs/cli) |

---

## 2. ClickHouse setup — two instances

DEX Board reads from two ClickHouse instances. They are intentionally separate because they serve different data shapes:

| Instance | Database | What it holds | What it powers |
|---|---|---|---|
| **Fleet-logs** | `fleet_logs` | Fleet's structured result/status/audit logs | `/` Dashboard (heatmaps, security cards, top processes) |
| **Firehose** | `default` | Raw osquery snapshot stream via S3 ClickPipe | `/devices`, `/insights`, `/reports`, Experience Score |

You can run them on the same ClickHouse account as two different services. Development tier is fine for Fleet-logs; Production tier is recommended for Firehose (it backs most of the host-level views and runs scoring MVs).

### 2.1 Create the services

In ClickHouse Cloud:
1. Create service "fleet-logs" → note the HTTPS endpoint + password.
2. Create service "dex-firehose" → note the HTTPS endpoint + password.

### 2.2 The Firehose ClickPipe (the prerequisite this repo does *not* automate)

The firehose tables are built **on top of** an S3 ClickPipe that Fleet writes osquery snapshots into. You must create the ClickPipe yourself (one-time, in the ClickHouse Cloud UI):

1. In the "dex-firehose" service, open **Data Sources → ClickPipes → Create**.
2. Source: S3. Point it at the bucket that Fleet's osquery logger writes to (configured on the Fleet server side).
3. Destination: leave the suggested table name (something like `s3-625dcbb6-…`). Note this name — you'll put it in `.env` as `CLICKPIPE_TABLE`.
4. Start the pipe. Wait for the first batch of rows to land before running §5.

If the ClickPipe is later re-created (which gives it a new UUID-suffixed name), update `CLICKPIPE_TABLE` and re-run `bash setup/setup-clickhouse-firehose.sh` — the materialized views will be re-pointed at the new source.

---

## 3. Fleet setup

DEX Board's signals come from a fixed set of Fleet scheduled queries. They must be deployed and **enabled** for any data to flow.

### 3.1 Apply the DEX query packs

```bash
fleetctl login                                    # against your Fleet server
fleetctl apply -f setup/fleet-query-packs/all/dex-queries.yml
fleetctl apply -f setup/fleet-query-packs/macos/dex-queries.yml
fleetctl apply -f setup/fleet-query-packs/linux/dex-queries.yml
fleetctl apply -f setup/fleet-query-packs/windows/dex-queries.yml
```

### 3.2 Required scheduled queries

The firehose materialized views key off the `name` column on the ClickPipe table. Make sure all of these are active on at least one team in Fleet:

- `DEX - Hardware experience - device health`
- `DEX - System experience - OS health`
- `DEX - Application experience - process health`
- `DEX - Application experience - crash summary`
- `DEX - Application experience - crash detail`
- `DEX - Application experience - adoption gap`
- `DEX - Network experience - VPN gate`
- `DEX - Device security posture`
- `Wi-Fi signal quality` (macOS)
- `macOS Running Apps` (macOS)
- `fleetd information`
- `System Information`

If any of these are paused or missing, the corresponding tile/view will show blanks. The dashboard does *not* tell you which schedule is dead — verify on the Fleet side.

### 3.3 Configure Fleet's ClickHouse logger (for the Fleet-logs instance)

The Fleet-logs lane is populated by Fleet's built-in ClickHouse logger pointed at your **fleet-logs** ClickHouse service. See [Fleet's logging docs](https://fleetdm.com/docs/configuration/fleet-server-configuration#logging-config). DEX Board itself doesn't manage this connection.

---

## 4. Local config — `.env`

```bash
cp .env.example .env
$EDITOR .env
```

Fill in:

```bash
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-token         # needs Workers Edit permission
WORKER_NAME=dex-board                   # change for forks / second deployments

# Fleet-logs ClickHouse
CLICKHOUSE_URL=https://fleet-logs.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=...
CLICKHOUSE_DATABASE=fleet_logs

# Firehose ClickHouse
FIREHOSE_CLICKHOUSE_URL=https://dex-firehose.clickhouse.cloud:8443
FIREHOSE_CLICKHOUSE_USER=default
FIREHOSE_CLICKHOUSE_PASSWORD=...
FIREHOSE_CLICKHOUSE_DATABASE=default
CLICKPIPE_TABLE=s3-625dcbb6-…           # from §2.2

# Optional — public access controls (leave empty to disable)
BASIC_AUTH_USER=
BASIC_AUTH_PASS=
CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=

# Optional — Fleet deep-link base URL (no trailing slash)
FLEET_URL=https://dogfood.fleetdm.com
```

### Cloudflare token

Create at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with **Edit Cloudflare Workers** permissions. The account ID is on the Workers & Pages overview page.

---

## 5. Bootstrap — one command

```bash
bash setup/setup.sh
```

This runs four phases sequentially:

1. **Fleet-logs schema** → applies `setup/clickhouse-schema/*.sql` to the Fleet-logs instance.
2. **Firehose schema + MVs** → creates 12 tables + materialized views on the Firehose instance, pointing them at `$CLICKPIPE_TABLE`.
3. **Secrets** → pushes the 12 secrets above to Cloudflare via `wrangler secret put`.
4. **Worker deploy** → `vite build` + `wrangler deploy --name $WORKER_NAME`.

The firehose **backfill** (an `INSERT INTO … SELECT FROM clickpipe-table`) is skipped by default because re-runs would duplicate rows. Pass `--backfill` on the very first run when the destination tables are empty:

```bash
bash setup/setup.sh --backfill          # first-time bootstrap
bash setup/setup.sh                     # subsequent re-runs (no backfill)
```

### Partial runs

```bash
bash setup/setup.sh --deploy-only       # just rebuild + redeploy the worker
bash setup/setup.sh --schema-only       # just (re-)apply ClickHouse DDL on both instances
bash setup/setup.sh --secrets-only      # just push secrets to Cloudflare
bash setup/setup.sh --env-file .env.x   # use a non-default .env
bash setup/setup.sh --op-item dex-board # source secrets from a 1Password item
```

Every phase is idempotent. Re-running the full script with no flags is safe.

---

## 6. Verify

After `setup.sh` finishes:

```bash
curl https://<worker>.workers.dev/health
# → {"status":"ok","queries_registered":80+}
```

Then open the worker URL in a browser:

- `/` Dashboard heatmap should render → confirms the **Fleet-logs** lane is wired.
- `/devices` host list should render → confirms the **Firehose** lane is wired.
- Click into a host → both views should populate.
- Click "Open in Fleet" → opens the Fleet host page via `FLEET_URL`.

If a section is blank, jump to §8.

---

## 7. For Fleet teammates

You can short-circuit most of the above:

```bash
git clone <repo> && cd dex-board
npm install
bash setup/setup.sh --op-item dex-board
```

Notes:
- The shared dogfood Fleet server already has the DEX query packs deployed.
- The shared `dex-firehose` ClickPipe already exists; you only need read credentials.
- `WORKER_NAME` should be unique to your fork (`dex-board-<yourname>` is fine).
- 1Password item `dex-board` carries the full set of fields named identically to `.env.example`. Add `WORKER_NAME` to it for your personal worker name.

The deploy will land at `https://<WORKER_NAME>.<account>.workers.dev`. Cloudflare Access policies are configured separately on the dashboard — ping `#dex-board` for the policy template.

---

## 8. For external deployments

You provide everything yourself: Cloudflare account, two ClickHouse services, Fleet server, ClickPipe, S3 bucket. The repo bootstraps DDL + worker; it does **not** bootstrap any of those upstream pieces.

Checklist before running `setup.sh`:

- [ ] Cloudflare account created + token issued with Workers Edit
- [ ] Two ClickHouse Cloud services running (§2.1)
- [ ] S3 bucket where Fleet writes osquery logs
- [ ] ClickPipe live, ingesting rows into the firehose CH (§2.2) — verify with one `SELECT count() FROM \`s3-…\``
- [ ] Fleet's ClickHouse logger writing to the fleet-logs CH (§3.3)
- [ ] DEX query packs applied + enabled on at least one team (§3.2)
- [ ] `.env` filled in (§4) — every field in `.env.example` set or intentionally blank

Sizing:
- Fleet-logs CH: Development tier is fine for ≤ 5K hosts.
- Firehose CH: Production tier recommended. The scoring MVs run 8-way LEFT JOINs on every batch insert; 2+ CPU, 4 GB+ RAM avoids back-pressure.

---

## 9. Local development

```bash
# Terminal 1 — worker API (port 8787)
npm run dev:worker

# Terminal 2 — Vite dev server (port 5173, proxies /api to 8787)
npm run dev
```

For local-only ClickHouse, create `.dev.vars` next to `wrangler.toml`:

```
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=fleet
CLICKHOUSE_PASSWORD=fleet
CLICKHOUSE_DATABASE=fleet_logs
FIREHOSE_CLICKHOUSE_URL=http://localhost:8124
FIREHOSE_CLICKHOUSE_USER=fleet
FIREHOSE_CLICKHOUSE_PASSWORD=fleet
FIREHOSE_CLICKHOUSE_DATABASE=default
```

`.dev.vars` is git-ignored.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns 500 with `"clickhouse_unreachable"` | Fleet-logs CH credentials wrong | re-check §4 `CLICKHOUSE_*`; `curl` the URL with the same `--user` |
| `/api/query` returns `"FIREHOSE_CLICKHOUSE_URL is not configured"` | Firehose secrets never pushed | `bash setup/setup.sh --secrets-only` |
| `/` heatmap is empty but `/health` is ok | Fleet-logs CH is up but has no rows | Check Fleet's ClickHouse logger config; `SELECT count() FROM fleet_logs.osquery_result_logs` |
| `/devices` empty | Firehose ClickPipe is dead, or `CLICKPIPE_TABLE` mismatch | `SELECT count() FROM \`<CLICKPIPE_TABLE>\`` should be > 0; re-run `setup-clickhouse-firehose.sh` after fixing `.env` |
| Score tiles blank, hostnames OK | One or more DEX schedules paused in Fleet (§3.2) | Re-enable in Fleet UI; data lands on the next schedule tick |
| `wrangler secret put` errors with "binding name collides" | Stale `[vars]` in old `wrangler.toml` | Run `--deploy-only` first to ship the clean toml, then `--secrets-only` |
| Two CF accounts collide on the same worker name | Both default to `dex-board` | Set `WORKER_NAME` in each `.env` to a unique value |
| Firehose backfill duplicates rows | Re-ran the script without `--skip-backfill` | The `ReplacingMergeTree` engine will dedupe over time, or `TRUNCATE` the affected table and re-run with `--backfill` |

For deeper firehose-side debugging (manual `curl` queries, ClickPipe re-creation, signal definitions), the script's inline comments are the source of truth — read `setup/setup-clickhouse-firehose.sh` directly.
