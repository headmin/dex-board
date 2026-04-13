# How-To: Update Materialized Views on Alt ClickHouse

Quick reference for refreshing the osquery-result-log materialized views on the
**alt/firehose ClickHouse** instance.

## TL;DR

```bash
# from project root
bash setup/create-alt-views.sh
```

That's it — the script reads `.alt-env`, then creates/updates 4 destination
tables + MVs and backfills them from the S3 ClickPipe source table.

---

## The moving parts

| File | Purpose |
|---|---|
| `.alt-env` | Credentials for the **alt** ClickHouse (git-ignored). Separate from `.env` so the firehose DB can be iterated on without touching the main dashboard DB. |
| `setup/create-alt-views.sh` | The runner. Sources `.alt-env`, then `curl`s each SQL statement individually to the HTTP endpoint. |
| `setup/create-alt-views.sql` | Human-readable reference copy of the same SQL — **not executed directly** (ClickHouse HTTP doesn't accept multi-statement bodies cleanly). |

### `.alt-env` shape

```bash
CLICKHOUSE_URL=https://<host>.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=...
CLICKHOUSE_DATABASE=fleet_logs
```

Same variable names as `.env` on purpose — the script just `source`s whichever
env file it's pointed at.

---

## What the script creates

Eleven (destination table + materialized view + backfill) trios, all reading
from the S3 ClickPipe source table `s3-93ac5ff3-825d-48f5-8db6-5d2c04e67b36`.

### Coverage map vs. `dex-queries.yml`

The upstream query pack lives at
`fleetdm/fleet/it-and-security/lib/all/reports/dex-queries.yml`. Every DEX
query in that file has a matching MV here, plus one extra (`fleetd_info`)
that comes from a different pack.

| # | Upstream query name (`dex-queries.yml`) | MV table | MV filter |
|---|---|---|---|
| 1 | `DEX - Network experience - Wi-Fi signal quality` | `wifi_signal` | `name ILIKE '%Wi-Fi signal quality%'` |
| 2 | `DEX - Application experience - macOS running apps` | `running_apps` | `name ILIKE '%macOS Running Apps%'` |
| 3 | *(not in dex-queries.yml — separate fleetd/orbit pack)* | `fleetd_info` | `name ILIKE '%fleetd information%'` |
| 4 | `DEX - Hardware inventory - system information` | `hardware_inventory` | `name ILIKE '%System Information%'` |
| 5 | `DEX - Hardware experience - device health` | `device_health` | `name ILIKE '%Hardware experience - device health%'` |
| 6 | `DEX - System experience - OS health` | `os_health` | `name ILIKE '%System experience - OS health%'` |
| 7 | `DEX - Application experience - process health` | `process_health` | `name ILIKE '%Application experience - process health%'` |
| 8 | `DEX - Network experience - VPN gate` | `vpn_gate` | `name ILIKE '%Network experience - VPN gate%'` |
| 9 | `DEX - Application experience - crash summary` | `crash_summary` | `name ILIKE '%Application experience - crash summary%'` |
| 10 | `DEX - Application experience - crash detail` | `crash_detail` | `name ILIKE '%Application experience - crash detail%'` |
| 11 | `DEX - Application experience - adoption gap` | `adoption_gap` | `name ILIKE '%Application experience - adoption gap%'` |

Each MV watches the S3 source and `ARRAY JOIN`s the `snapshot` JSON array,
extracting typed columns so dashboard queries don't have to parse JSON at
read-time.

### Keeping MVs in sync with `dex-queries.yml`

The MV's extracted columns map 1:1 to the **output columns** of the osquery
SELECT in the yml — not to the underlying osquery tables. So when a query's
`SELECT` column list changes upstream:

1. **Renamed column** → `JSONExtractString` silently returns `''` (or `0`
   via the `toXOrZero` wrappers). Data quietly stops landing. Update the
   extraction to the new field name.
2. **New column** → not a breaking change, but the new data is dropped on
   the floor. Add it to the destination table (`ALTER TABLE … ADD COLUMN`)
   and to the MV's SELECT.
3. **Removed column** → MV keeps returning `''`/`0` for that slot. Drop it
   from the destination table + MV if you don't want the dead column.

**Rule of thumb:** any PR that edits `dex-queries.yml` should also edit
`setup/create-alt-views.sh` + `setup/create-alt-views.sql`. Open both.

---

## Re-running the script — important gotchas

The script has **two different idempotency characteristics** you need to keep
straight:

| Step | Idempotent? | Notes |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | ✅ | Safe to re-run, no-op if exists |
| `CREATE MATERIALIZED VIEW IF NOT EXISTS` | ✅ | Safe to re-run, no-op if exists |
| `INSERT INTO … SELECT …` (backfill) | ❌ | **Duplicates rows** on every run |

### Safe re-runs

If you just want to make sure tables/MVs exist and haven't been edited — the
script is safe. The `IF NOT EXISTS` guards prevent schema changes, and the
backfill only re-inserts whatever is currently in the S3 source.

### When you want to change a schema

`CREATE … IF NOT EXISTS` will **silently skip** the change. To actually apply
a new column or type:

```sql
-- Drop the MV first (keeps the destination table)
DROP VIEW IF EXISTS wifi_signal_mv;
-- Then either ALTER or DROP+recreate the destination table
DROP TABLE IF EXISTS wifi_signal;
```

Then re-run `bash setup/create-alt-views.sh`.

### Avoiding duplicate backfill rows

After the *first* successful run, the MV handles new inserts automatically —
you do **not** need to re-backfill. If you re-run the script anyway, either:

- `TRUNCATE TABLE <name>` before re-running, so the backfill starts clean, or
- Edit the script to comment out the `BACKFILL` blocks for tables that are
  already populated.

---

## Verifying

The script prints row counts after each step. You can re-check manually:

```bash
source .alt-env
curl -s --user "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" \
  --data-binary "SELECT count() FROM wifi_signal FORMAT TabSeparated" \
  "$CLICKHOUSE_URL"
```

Or check that the MV is attached:

```sql
SELECT name, engine, create_table_query
FROM system.tables
WHERE database = currentDatabase() AND engine = 'MaterializedView';
```

---

## Adding a new materialized view

Triggered when a new query is added to `dex-queries.yml` (or any other
upstream pack that lands in the same S3 ClickPipe).

1. Add a new section to `setup/create-alt-views.sh` following the existing
   three-step pattern (destination table → MV → backfill). For sections 5+
   the script uses a `FOO_SELECT=` variable to share one SELECT string
   between the MV definition and the backfill — follow that pattern.
2. Pick a `WHERE name ILIKE '%…%'` filter that uniquely matches the query
   name. Prefer the full `"<category> - <leaf>"` suffix (e.g.
   `'%Application experience - crash detail%'`) to avoid accidentally
   matching a sibling query.
3. Mirror the table + MV into `setup/create-alt-views.sql` so the reference
   file stays in sync.
4. Update the coverage map above in this file.
5. Run `bash setup/create-alt-views.sh`.
6. Wire the new table into a worker query under `src/worker/queries/alt-*.ts`.
