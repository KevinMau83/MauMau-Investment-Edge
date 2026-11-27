# Development status

## Current phase

Phase 1 functional foundation, prepared in an isolated local Git repository on `feature/mau-mau-investment-edge`. The target GitHub repository, KevinMau83/MauMau-Investment-Edge, had no refs, existing applications or dependencies to preserve. The review branch is based on an empty main commit so the full foundation can be reviewed before merging. Deployment is pending.

## Implemented

- Responsive light and dark PWA shell with local owner sign-in, no offline storage of owner records, SQLite persistence and a backup utility.
- Manual property creation and editing, address and county parcel deduplication, immutable history snapshots, optimistic update checks, watchlist and source evidence.
- Independent Buy and Hold, Flip and BRRRR models, conditional assignment estimate, configurable underwriting criteria, rent and financing stress tests, side-by-side strategy comparisons and mandatory gates.
- Evidence type and date fields, comparable records, owner-entered valuation ranges and rehabilitation component ranges with contingency and owner override.
- Preliminary investment and seller motivation scores, four evidence-filtered opportunity boards, manual geographic filters and coordinate map, price reduction and watched-status activity.
- Editable negotiation draft, due diligence checklist, passive income scenarios, printable eleven-section intelligence report and CSV export.

## Architectural decisions

- Isolated application is provisional until the existing repository can be inspected. Python and SQLite provide a no-service, low-maintenance foundation. Reassess component reuse, authentication and deployment after repository inspection.
- Keep formulas in `finance.py`, server-side validation and storage in `app.py`, and display and owner interaction in `static/`.
- Store listing facts separately from owner underwriting assumptions. Property history is transactional and repeated edits with identical payload do not add versions. Live and illustrative records have separate deduplication namespaces.
- Price alerts are derived from recorded changes with the current threshold. Seller motivation flags are owner-entered and carry fixed weights. General and rental scores have configurable weights. Rental targets and major allowances are configurable. Demand currently uses evidence confidence as a proxy. Evidence status is owner-assigned and its link and date are required when marked verified.
- The map plots recorded coordinates. Mileage and drive time are owner-entered. Board ranking uses available underwritten metrics and evidence, with gate-cleared entries first. Valuation ranges and comparables are stored as evidence for review. Automated valuation and image-analysis methods remain future work.

## Phased roadmap

| Phase | Next work |
| --- | --- |
| 1 · Foundation review | Review the dedicated feature branch. Validate the underwriting assumptions and owner workflows before merging. |
| 2 · Investment intelligence | Implement adjustable motivation weights, market-demand and valuation confidence models, authorized data adapters and import, routing and fuller evidence requirements. |
| 3 · Automated research | Add authorized source registry, per-provider verification and run logs, idempotent upserts with source-level provenance, manual runs, broader in-app alerts and report snapshots. Schedule Monday, Wednesday and Friday at 6 a.m. America/Chicago only after validating adapters, permitted usage and deployment. |
| 4 · Portfolio and capital | Add owned asset, lease, loan and maintenance records, liquidity and exposure tracking, portfolio financial history and persistent goal planning. |
| 5 · Production readiness | Validate real-device iPhone installation, accessibility, load and security, verify recovery in deployment, harden credential handling and document owner onboarding. |

## External dependencies and limitations

Live listing and comparable feeds, MLS, geocoding and routing require selected authorized providers and any applicable credential, license or subscription. No services or scheduled discovery have been activated. Existing portfolio, lease and capital ledgers are pending. The income planner runs in browser memory. Cash reserve, legal, valuation and other documented gates use owner attestations. Confirm economic inputs and source coverage before relying on a recommendation.

## Verification and deployment

The automated suite covers finance formulas, unfavorable conditions, zero and missing inputs, validation, persistence, deduplication, evidence and demo separation, backup restore, HTTP authentication, same-origin enforcement and export. Review local configuration and deployment requirements in the README. A production deployment and device acceptance remain pending.

The 14 automated tests passed on Python 3.12. JavaScript syntax checks passed. A Chromium browser smoke test with a temporary database exercised property and comparable entry, watchlist persistence, criteria updates and CSV download. Dashboard, property detail, editor, reports and criteria rendered without horizontal document overflow at an emulated iPhone 13 viewport. Device-specific Safari behavior and home-screen installation remain unverified.
