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
display for co-determination contexts. What it does today:

- the per-host score table ("hosts needing attention") is hidden, and the
  host-list query behind it is not even fetched;
- per-app drill-downs are disabled — the lists of *which hosts* hold an idle
  seat, in both Software usage and the software signal detail;
- the software comparison in the host A/B compare panel is hidden.

Aggregates, scores and distributions stay visible throughout. This is a
display-level control intended for shared/committee settings; access control
(below) governs who can see the data at all.

Note the scope honestly: WC mode gates the per-host *drill-downs*, not every
per-host surface. The host queue (`/hosts`), host detail, the reports tables
and the refresh shortlist still name individual hosts while it is on. If a
works-council agreement requires that no per-host view exists at all, that
has to be enforced server-side in `src/worker/` — not by this toggle.

## Demo mode — pseudonyms, not privacy

A second, independent toggle (sidebar footer, or `?demo=1` on any URL) renders
identifying values as **deterministic pseudonyms** so the dashboard can be
shown to an outside audience:

| Category | Real | Shown in demo mode |
|---|---|---|
| Host name (`computer_name` / `hostname`) | `Dale's MacBook Pro` | `tidal-forge-4493` |
| Team | `team-247` | `Team Juno` |
| Fleet admin email (Audit log) | `someone@company.com` | `admin-9a84@example.com` |
| Git commit author (GitOps) | `Allen Houchins` | `Person 7ad3` |
| Hardware serial | `C02XK1ZBJGH5` | `SN-C2B41B88` |
| In-house software title | `AcmeCorp VPN Client` | `Internal Tool 3` |
| Recognised public software | `Adobe Photoshop` | *unchanged* |

Pseudonyms are a pure hash of the host's stable UUID, so the same host shows
the same fake name in every panel and across reloads — drill-downs, sorting
and cross-panel comparisons all stay coherent. Public software titles are
deliberately left readable: "Photoshop idle on 40 seats" is the point of the
software views, and naming public software identifies nobody. What gets masked
is bespoke in-house tooling, which does.

Two further categories are masked because they give a company away more
precisely than a display name does: reverse-DNS identifiers (bundle ids, crash
identifiers, process names — `com.acmecorp.agent` → `com.internal.heron-72`,
with public vendor prefixes such as `com.apple.*` left readable), and install
paths.

Two **free-text** fields are redacted to `—` rather than pseudonymised: the
audit log's `detail` column and fleetd's `last_error` (which embeds the org's
own Fleet URL — "dial tcp: lookup fleet.acmecorp.com"). Arbitrary prose has no
structure to rewrite reliably, and a best-effort scrub of free text fails
*open*, which is the wrong direction. Both are diagnostics, not part of any
demo narrative.

While demo mode is on, the "Open in Fleet" links are hidden — Fleet would open
the host under its real name in a new tab, which no masking on this page can
prevent. The host search box also stops matching raw hostnames: left in, it
would be a de-anonymisation oracle, since anyone who knows one real hostname
could type it and watch the single matching row filter in, binding that name to
its pseudonym and to the host's scores.

**Demo mode is not a privacy control.** Masking happens at render time, so
real hostnames still arrive in every `/api/query` response and remain visible
in the browser's Network tab and in Vue devtools. It keeps names off a shared
screen; it does not restrict access to data. Only server-side rewriting
(`src/worker/query-registry.ts`) would make the data itself untraceable. Do
not present it as satisfying a works-council or GDPR requirement — that is
what Works-Council mode and the access controls below are for. The two toggles
are independent and can be on at the same time.

Scope is set by one constant, `DEMO_FIELDS` in
`src/dashboard/composables/useDemoMode.js`. Host UUIDs are deliberately never
masked: they are Vue `:key` values, dedup keys and the `/hosts/:hostId` route
param, and a bare UUID identifies nobody without Fleet access.

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
