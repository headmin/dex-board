# Experience Score — Fleet-Wide Digital Employee Experience

## The idea

Every IT fleet generates thousands of telemetry signals per hour — CPU class,
RAM pressure, Wi-Fi quality, OS patching, app crashes, software adoption. Alone,
each signal is noise. Aggregated into a single score, they become a compass.

The **Experience Score** distills raw osquery telemetry into one number (0-100)
that answers: *"How well is this fleet supporting the people who use it?"*

It is not a security score, a compliance score, or an asset inventory. It is a
**digital employee experience (DEX)** score — measuring whether the hardware,
software, and network environment let employees do their job without friction.

## Why a single number

| Audience | What they get |
|---|---|
| **IT leadership** | A grade (A–F) they can trend over time and report to the business. "We went from C to B this quarter." |
| **Desktop engineers** | Category breakdowns (Device Health, Performance, Network, Security, Software) that pinpoint where to invest. |
| **Helpdesk** | Per-device scores that flag which machines need attention before a ticket is filed. |

A composite score creates shared language across these audiences. When
Performance drops from B to D, everyone sees it — and the signal breakdown
shows *why* (swap pressure, process memory, uptime staleness).

## Five categories

### Device Health (25% of composite)

*Can the hardware keep up?*

| Signal | Weight | What it measures |
|---|---|---|
| CPU generation | 30% | Apple Silicon class (M1–M5) or Intel generation |
| RAM tier | 25% | 8 GB / 16 GB / 32 GB+ — below 16 GB is the new constraint |
| Battery health | 25% | Good / degraded / replace (cycles + capacity ratio) |
| Swap pressure | 20% | None / light / elevated / severe — heavy swap = the machine is drowning |

A fleet of M4 MacBook Pros with 32 GB RAM and healthy batteries scores 95+.
An aging fleet of 8 GB Intel machines with degraded batteries scores 40-50.

### Performance (35% of composite)

*Is the machine responsive right now?*

| Signal | Weight | What it measures |
|---|---|---|
| Swap pressure | 35% | Same as above — swap is the #1 predictor of "my Mac is slow" |
| Compression pressure | 30% | macOS memory compression level. Note: macOS compresses aggressively by design — "high" compression is *normal*, not alarming. Scored accordingly (high = 65, not 30). |
| Top process memory | 20% | Largest single process RSS. A 15 GB VM is a red flag; a 500 MB browser is fine. |
| Uptime staleness | 15% | Days since last reboot. >14 days = stale. Reboots clear transient resource leaks. |

Performance gets the highest composite weight (35%) because it directly maps to
"my computer is slow" — the most common employee complaint to IT.

### Network (informational — excluded from composite)

*Is the connection good enough?*

| Signal | Weight | What it measures |
|---|---|---|
| Wi-Fi RSSI | 40% | Signal strength in dBm. >-50 excellent, <-80 unusable. |
| Signal-to-noise ratio | 30% | SNR in dB. Measures interference, not just signal. |
| Transmit rate | 20% | Negotiated link speed in Mbps. Proxy for channel width + band. |
| VPN confidence | 10% | tunnel_active / direct_connected / disconnected. |

Network is **excluded from the composite** because it's too volatile — a device
that was excellent 10 minutes ago might be in a bad spot now. But it's displayed
as an informational signal so desktop engineers can correlate network with
Performance complaints.

### Security (20% of composite)

*Is the OS current and healthy?*

| Signal | Weight | What it measures |
|---|---|---|
| OS currency | 50% | current / n-1 / n-2 / legacy. Running the latest macOS = 100. |
| DEX OS health | 50% | Composite from osquery: combines OS version, uptime risk, and crash frequency into healthy / acceptable / degraded. |

Security is intentionally limited to **OS-layer signals** from the firehose.
Full security posture (disk encryption, firewall, SIP, Gatekeeper) requires
Fleet's built-in compliance queries which feed a separate scoring pipeline.
When those signals become available in the firehose, they'll be added here.

### Software (20% of composite)

*Is the software environment healthy?*

| Signal | Weight | What it measures |
|---|---|---|
| Crash frequency | 40% | 7-day crash count per device. 0 = 100, 10+ = 20. |
| App adoption | 35% | % of installed apps actively used this week. Measures software sprawl. |
| App count | 25% | Total installed apps. <80 is lean, 160+ is bloated. |

Software score penalizes crash-prone environments and shelfware (apps installed
but never opened). A healthy fleet has low crashes, high adoption, and a
manageable number of apps.

## The composite formula

```
Composite = 0.25 * Device_Health
          + 0.35 * Performance
          + 0.20 * Security
          + 0.20 * Software
```

Network is displayed but excluded — it's too noisy to include in a number that
drives quarterly decisions.

### Grading

| Grade | Score range | Meaning |
|---|---|---|
| **A** | 90-100 | Fleet is excellent — hardware modern, performance smooth, software clean |
| **B** | 75-89 | Good — minor issues in 1-2 categories, no employee complaints expected |
| **C** | 60-74 | Acceptable — some devices struggling, targeted intervention needed |
| **D** | 40-59 | Poor — multiple categories degraded, employees likely noticing friction |
| **F** | 0-39 | Critical — fleet is actively impeding work |

## How scores are computed

Scores are computed **at query time** from raw firehose materialized views —
no pre-aggregation step, no batch jobs. Each query JOINs across 7 ClickHouse
tables (device_health, os_health, process_health, wifi_signal, vpn_gate,
crash_summary, adoption_gap) and applies CASE expressions to convert raw
telemetry into 0-100 scores.

### NULL handling

Not every device reports to every table. A device might have hardware
telemetry but no Wi-Fi data (desktop Mac on Ethernet) or no crash data
(never crashed). Missing data is handled with `ifNull()` defaults that
assume **reasonable middle ground** — not worst-case:

| Missing table | Default assumption | Score effect |
|---|---|---|
| os_health | Current OS, acceptable health | Security ≈ 85 |
| process_health | No heavy processes | Performance process signal = 100 |
| wifi_signal | Moderate signal (-65 dBm) | Network ≈ 75 |
| vpn_gate | Direct connected | Network VPN signal = 80 |
| crash_summary | Zero crashes | Software crash signal = 100 |
| adoption_gap | 70% active, 50 apps | Software ≈ 80 |

This prevents the "25-on-Security" bug where devices with no OS data were
penalized as if they were running legacy, degraded systems.

## Dimension breakdowns

Scores can be sliced by:
- **OS currency** (current vs n-1 vs legacy) — shows if lagging OS is dragging the fleet
- **Hardware model** (Mac16,7 vs MacBookPro18,1 vs ...) — reveals model-specific issues
- **RAM tier** (8 GB vs 16 GB vs 32 GB+) — quantifies the RAM-constrained device problem

Each dimension shows the average composite + per-category scores for devices
in that cohort, enabling targeted decisions ("8 GB devices average 52 — time
to refresh").

## What this is not

- Not a **compliance score** — compliance is binary (encrypted or not); this is a gradient
- Not a **risk score** — risk quantifies threat exposure; this quantifies employee friction
- Not an **uptime metric** — devices can be "up" and miserable
- Not a **benchmark** — there is no industry standard; the value is trending *your own* fleet

## Data source

All signals come from Fleet's osquery result logs, piped via S3 ClickPipe into
ClickHouse Cloud materialized views. The scoring engine reads from 11 tables
covering hardware inventory, device health, OS health, process health, Wi-Fi
signal, VPN status, crash events, and app adoption.

Source of truth: `fleetdm/fleet/it-and-security/lib/all/reports/dex-queries.yml`
