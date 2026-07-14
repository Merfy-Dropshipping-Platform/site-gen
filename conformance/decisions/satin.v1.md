# Satin conformance decision ledger — v1

> Tracked normative decisions for the Satin structural conformance baseline.
> Stable headings/IDs — referenced by the release contract and the classification
> fixtures. This ledger records DECISIONS and OWNERSHIP, never an implementation
> observation as a product norm.

## D-SATIN-001 — All Satin surfaces remain OPEN

`status: open`

Every Satin storefront surface (home, catalog, product, cart, cart-drawer,
wishlist, search, auth/OTP, checkout, checkout-result, account/orders, legal,
publications, newsletter, color-swatches, filter-sidebar) is required to be
open/working. The user requires all surfaces exposed; no surface is scoped out.
`wishlist` is required `true` even though the current `theme.json` declares it
`false` (that mismatch is a GAP, not a contract change).

## D-SATIN-002 — No permanent waiver

`status: binding`

No structural finding is permanently waived. Every open item is either a `GAP`
(a defect to fix) or a `NEEDS_DECISION` (an unresolved decision to make). A
`NEEDS_DECISION` is never silently dropped and never converted to an implicit
accept.

## D-SATIN-003 — Bloom has separate ownership

`status: binding`

Bloom's requirements, findings and release contract are owned separately
(`bloom-release-contract.ts`, Bloom baselines). No Bloom Benefits, Bloom
Publications implementation fact, Bloom radius finding or Bloom storage/event
name is normative for Satin. Cross-theme precedent does not overrule the approved
Satin contract.

## D-SATIN-004 — Structural PASS is NOT behavior PASS

`status: binding`

A green structural tier proves source/contract SHAPE only. Authoring, effect and
browser tiers remain `UNKNOWN` until a later plan's runner executes them. The
overall release status stays non-PASS while any required behavior tier is
`UNKNOWN`. A static render/parse never awards a behavior/browser PASS.

## D-SATIN-005 — Canonical Publications route is OPEN

`status: needs-decision`
`capability: satin.flow.publications.canonical-route`

`/publication`, `/publications` and `/blog` conflict. The canonical Publications
route (and the merchant list/detail data source mapping,
`satin.flow.publications.merchant-data` / `detail-route`) stays unresolved until
Figma/user/product review.

## D-SATIN-006 — Merchant order-settings persisted mapping is OPEN

`status: needs-decision`
`capability: satin.flow.merchant-order-settings.persisted-mapping`

The canonical key/value mapping for merchant order-settings (address / contact /
processing / customer-info) is unresolved. Unmerged keys are NOT normative. The
individual `*.persistence` findings are `GAP` (visible options are currently
no-op); the mapping itself is a decision.

## D-SATIN-007 — Additional authoring/default/lifecycle decisions are OPEN

`status: needs-decision`

The following stay visible and unresolved until review; each emits
`NEEDS_DECISION`, never an empty waiver:

- `satin.decision.multirows.behavior` — MultiRows behavior
- `satin.decision.footer.groups-defaults` — Footer groups/defaults
- `satin.decision.imagewithtext.alignment` — ImageWithText alignment
- `satin.decision.collapsiblesection.sidebar-layout` — CollapsibleSection sidebar layout
- `satin.decision.header.recursion-depth` — Header recursion depth
- `satin.decision.logo.migration-cohorts` — logo migration cohorts
- `satin.decision.version-domain.meaning` — version-domain meaning
- `satin.decision.lifecycle.fresh-default-cohort` — fresh-default cohort
- `satin.decision.lifecycle.switch-reseed-preservation` — switch/reseed preservation

## D-SATIN-008 — Playwright and account flows are LATER

`status: deferred`

Playwright browser verification and real customer-account flows are out of scope
for the structural baseline. They belong to the later integration/behavior plan
and stay `UNKNOWN` here.

## D-SATIN-009 — Publish / deploy require SEPARATE approval

`status: binding`

Publishing or deploying any Satin site is out of scope for this plan and requires
separate explicit approval. This baseline never publishes, deploys or mutates a
live site. Publish call paths are recorded for REACHABILITY only.
