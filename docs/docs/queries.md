# Query registry

DEX Board uses a named query registry — no raw SQL is constructed in the browser. All 88 queries are defined server-side with parameterised inputs and validation.

## How it works

```
Browser → POST /api/query { query: "health.summary", params: { timeRange: "24" } }
       → Worker validates params against query definition
       → Worker builds parameterised SQL with ClickHouse placeholders
       → ClickHouse executes query
       → Worker returns { data: [...], meta: { rows, duration_ms } }
```

## Query domains

| Domain | Queries | Description |
|---|---|---|
| `health` | 11 | Device health metrics, timeseries, heatmaps |
| `devices` | 11 | Roster, inventory, filter options, distribution |
| `security` | 8 | Encryption, firewall, SIP, compliance |
| `processes` | 11 | Top processes, trends, snapshots |
| `network` | 3 | WiFi quality, signal strength |
| `audit` | 6 | Admin activity, timeline |
| `software` | 12 | App usage, patch velocity, stale apps |
| `scores` | 26 | Experience scores, benchmarks, GitOps |

## Inspecting queries

List all registered queries:

```bash
curl https://your-worker.workers.dev/api/queries
```

Inspect a specific query:

```bash
curl https://your-worker.workers.dev/api/queries/health.summary
```

## Parameter types

| Type | Validation |
|---|---|
| `string` | Optional regex pattern match |
| `number` | Min/max range check |
| `enum` | Closed allowlist of values |

## Filter injection

Queries use template macros that the Worker replaces at execution time:

- `{{FILTERS}}` — Device filters (OS, model, search, encryption)
- `{{TIME_FILTER}}` — Time range constraint
- `{{LIMIT}}` — Row limit

All user input enters via ClickHouse `{name:Type}` parameterised placeholders — never string interpolation.
