# Privacy & data minimization

DEX Board measures **device experience, not people**. Its purpose is to give
IT one defensible number for how well the fleet's hardware and software serve
employees — to drive refresh, capacity, and license decisions. It is designed
to support employees, not monitor them.

This page states what is collected, what is deliberately **not** collected,
how long data is kept, and how the design supports co-determination
(works-council / Betriebsrat) requirements.

## What is collected

All telemetry is **device-scoped**, collected by [osquery](https://osquery.io)
via Fleet on a fixed schedule. The exact queries are version-controlled and
auditable — the source of truth is Fleet's upstream
[`dex-queries.yml`](https://github.com/fleetdm/fleet/blob/main/it-and-security/lib/all/reports/dex-queries.yml).
Nothing outside these columns is ingested.

| Category | Signals |
|---|---|
| Hardware inventory | Model, CPU class, RAM tier, disk capacity |
| Device health | Memory/swap pressure tier, battery health tier |
| OS health | OS version & currency, uptime, reboot recency |
| Application health | App names, install & last-opened timestamps, per-process memory footprint, crash counts by bundle identifier |
| Network quality | Wi-Fi signal metrics (RSSI, SNR, transmit rate), connection type (VPN / direct) |
| Security posture | FileVault, firewall, Gatekeeper, SIP — as on/off booleans |

Where possible, classification happens **on the device** (e.g. macOS reports
a pressure *tier*, not raw memory dumps), so the pipeline carries categories
rather than raw behavior.

## What is not collected

No keystrokes. No screen contents or screenshots. No browsing history or
URLs. No file contents or file names. No emails, messages, or documents. No
camera or microphone access. No geolocation. No working-time or activity
tracking. The only user-behavior-adjacent signal is app-level ("this app was
last opened N days ago"), used solely for license-waste scoring.

## Retention — enforced, not promised

Retention is enforced by **ClickHouse TTLs in the schema**
(`setup/clickhouse-schema/`), not by manual policy:

| Data | Retention | Why |
|---|---|---|
| Raw telemetry events | **90 days** | Enough to score and diagnose; then gone |
| Software / patch detail | **180 days** | Patch-velocity measurement window |
| Software daily rollups | **365 days** | Seasonal license-usage patterns |
| Hourly score aggregates | **180 days** | Short-term trend drill-down |
| Daily score aggregates | **730 days** | Two-year trend for refresh planning |

The pattern is deliberate: **identifiable raw data is short-lived; what
persists long-term is aggregated.**

## Aggregation first, and Works-Council mode

The dashboard leads with **fleet-level aggregates** — scores, distributions,
cohort comparisons. Per-device views exist for IT support workflows.

A built-in **Works-Council mode** (shield toggle in the header) restricts the
display for co-determination contexts: per-device score tables are hidden,
and per-app usage views are reduced to browser-category and licensed-software
**aggregates**. This is a display-level control intended for shared/committee
settings; access control (below) governs who can see the data at all.

## Identification & purpose limitation

Telemetry is keyed by device (hostname, serial number). Because devices are
typically assigned to one person, **treat this data as personal data under
GDPR**. Its purpose is limited to: device-experience scoring, hardware
refresh and capacity planning, and software license hygiene. It is **not**
suitable for — and must not be repurposed as — individual performance
monitoring or working-time tracking.

Access is restricted: the dashboard sits behind HTTP Basic auth **and**
Cloudflare Access (SSO/JWT); database credentials exist only as server-side
worker secrets.

## Co-determination note (Germany)

Systems that are objectively capable of monitoring employee behavior or
performance are typically subject to works-council co-determination
(BetrVG §87(1)(6)) — involve the Betriebsrat **before** rollout. This page,
the version-controlled query pack, and the TTL schema are intended to serve
as the technical annex to such an agreement: they define exactly what is
collected, why, and for how long. (This is an engineering statement, not
legal advice.)
