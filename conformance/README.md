# Theme structural conformance

This directory holds the **tracked** artifacts of the theme structural-conformance
gate: the machine-generated inventory and the reviewed baseline/requirements. The
gate builds a black-box snapshot of a theme's sections, Theme Settings, pages,
renderer/build reachability and storefront logic, turns every structural defect
and every non-`PASS` capability into a fingerprinted finding, and refuses any
finding that is not already accepted in the checked-in baseline. The baseline may
only ever **shrink**.

The first (and currently only) target theme is **`bloom`**; `luna` is excluded.

## Tracked vs local files

| Path | Tracked? | Meaning |
| --- | --- | --- |
| `conformance/requirements/bloom.v1.json` | yes | The **reviewed** normative requirements. Never auto-regenerated. |
| `conformance/inventory/bloom.generated.json` | yes | The machine inventory (capabilities, issues, findings, requirement locks). Byte-exact. |
| `conformance/baselines/bloom.structural.json` | yes | The accepted baseline: three digests + parent link + accepted findings + requirement locks. |
| `conformance-results/bloom/` | **no** (gitignored) | Local JSON/Markdown report evidence. |

The tracked inventory and the baseline form **one recoverable transaction**: the
baseline stores the inventory's SHA-256 (`inventoryDigest`) and a `reviewDigest`
that binds the source digest, inventory digest, requirement locks and findings.
Normal mode trusts neither file alone — their digest link must match.

## Build prerequisites (exact order)

`corepack pnpm build` **always** runs before `build:blocks` (the Nest build wipes
`dist/`). `run-theme-build.ts` reads `NODE_AUTH_TOKEN` from your shell; never print
it.

```bash
corepack pnpm build
corepack pnpm build:blocks
corepack pnpm build:theme-sections bloom
corepack pnpm exec tsx scripts/run-theme-build.ts bloom
```

## Everyday commands

### Normal gate (CI-safe, read-only)

Exact-match the tracked inventory and the fingerprinted baseline. Fails on any
unexpected/stale/changed finding, a stale inventory or a broken digest link.

```bash
corepack pnpm conformance:bloom
```

### Release gate (`--require-zero`)

Same as normal, but fails while **any** finding still exists. This stays RED until
every accepted gap is remediated (some gaps — e.g. `--radius-button` over the
registry max — are intentionally accepted for now and keep release red).

```bash
corepack pnpm conformance:bloom:release
```

### Diagnose (non-mutating pre-baseline review)

Permits a missing baseline/inventory, writes the complete report and exits `0` for
ordinary product findings — but still exits non-zero for harness/build/import/
nondeterminism failures. This is the **only** mode used to review findings before a
one-time capture. Two unchanged diagnose runs produce byte-identical JSON/Markdown
and the same review digest.

```bash
corepack pnpm conformance:bloom:diagnose
```

## Reviewed-only maintenance (local, never in CI)

Every mutation requires **non-CI**, an explicit acknowledgement env var, a
`--review-digest sha256:...` taken from a reviewed diagnose report, and (for the
two-file transaction) `--write-inventory`. Immediately before writing, the CLI
recomputes the candidate from current sources and rejects if the digest differs
from the reviewed one. The only legal combinations are inventory-only refresh,
capture+inventory, shrink+inventory or append-requirements+inventory.

### Propose requirements (bootstrap input only)

Deterministically proposes one requirement row per current editable capability,
per non-`PASS` structural issue and per required page/flow. Writes only a **local**
proposal and never reads or overwrites the reviewed artifact. The output is input
to manual/Figma review, not an authority.

```bash
corepack pnpm conformance:bloom:propose-requirements
```

### One-time initial capture

```bash
BLOOM_BASELINE_ACK=initial-bootstrap \
BLOOM_INVENTORY_ACK=reviewed-refresh \
corepack pnpm exec tsx scripts/theme-conformance.ts \
  --theme bloom \
  --baseline conformance/baselines/bloom.structural.json \
  --inventory conformance/inventory/bloom.generated.json \
  --report-dir conformance-results/bloom \
  --capture-initial-baseline --write-inventory \
  --review-digest sha256:<from-diagnose>
```

Requires a **missing** baseline and yields `parentBaselineDigest: null`. Once the
baseline exists, initial capture cannot run again.

### Reviewed inventory refresh (findings + requirement locks unchanged)

```bash
BLOOM_INVENTORY_ACK=reviewed-refresh \
corepack pnpm exec tsx scripts/theme-conformance.ts \
  --theme bloom --baseline … --inventory … --report-dir … \
  --write-inventory --review-digest sha256:<from-diagnose>
```

### Shrink-only remediation

Removes accepted findings after they are truly fixed. Rejects every addition,
fingerprint replacement and requirement-set change; requires at least one removal.

```bash
BLOOM_BASELINE_SHRINK_ACK=verified-remediation \
BLOOM_INVENTORY_ACK=reviewed-refresh \
corepack pnpm exec tsx scripts/theme-conformance.ts \
  --theme bloom --baseline … --inventory … --report-dir … \
  --shrink-baseline --write-inventory --review-digest sha256:<from-diagnose>
```

### Append-only requirement locking

Grows the reviewed requirement locks with a strict superset while keeping the
finding set byte-identical. A new requirement that exposes a missing capability
keeps normal mode RED until it is implemented — requirement growth can never become
a waiver.

```bash
BLOOM_REQUIREMENTS_ACK=reviewed-append \
BLOOM_INVENTORY_ACK=reviewed-refresh \
corepack pnpm exec tsx scripts/theme-conformance.ts \
  --theme bloom --baseline … --inventory … --report-dir … \
  --append-requirement-locks --write-inventory --review-digest sha256:<from-diagnose>
```

## Recovery

If a mutation crashes after the inventory commit but before the baseline commit,
the gate stays RED (inventory present, baseline absent). Re-running the **same
reviewed command** resumes only when the existing inventory bytes exactly equal the
current candidate; any other partial state aborts without mutation.

## Redaction

Every value written into a report is recursively scrubbed of auth material
(`password`, `otp`, `cookie`, `authorization`, `secret`, `apiKey`, `accessToken`,
`refreshToken`, `sessionId`, `sessionToken`, `resetCredential`, `storageState`,
`email`) and of any email-address-looking string. Legitimate design keys named
`tokens` / `colorSchemes` are **not** redacted.

---

## Satin — tiered semantic baseline (3-artifact transaction)

Bloom uses the **legacy two-artifact** format above (inventory + baseline) and
requires **no** tier manifest; its commands and golden fixture
(`packages/theme-contract/__tests__/fixtures/bloom-legacy-*.json`) are unchanged.

Satin is **tiered**. The approved Satin design must later add authoring/effect/
browser tiers and must never rewrite normative locks merely because a source SHA
changed. Satin therefore tracks **three** artifacts:

| Path | Tracked? | Meaning |
| --- | --- | --- |
| `conformance/requirements/satin.v1.json` | yes | Reviewed normative requirements. |
| `conformance/requirements/satin.revisions.json` | yes | Append-only semantic-revision ledger (initial `{ "schemaVersion": 1, "theme": "satin", "revisions": [] }`). |
| `conformance/inventory/satin.generated.json` | yes | Machine inventory (byte-exact). |
| `conformance/baselines/satin.structural.json` | yes | The **structural tier** `TierBaseline` (accepted findings + shape/case digests). |
| `conformance/baselines/satin.manifest.json` | yes | The `ThemeBaselineManifest`: the nine per-tier digests + capture provenance + parent chain. |
| `conformance-results/satin/` | **no** | Local report evidence. |

The three tracked files form **one recoverable transaction**: all bytes, ACKs,
the reviewed digest, monotonicity proofs and destination paths are validated
before the first write; the inventory commits first, `satin.structural.json`
second and `satin.manifest.json` **last** (the commit point). A crash between
commits keeps the gate RED; re-running the same reviewed command resumes only
when each already-renamed file is byte-identical to the recomputed candidate.

A **source-only** change moves nothing in the structural baseline/manifest — it
only makes the tracked inventory stale until a reviewed inventory refresh. A
normative **shape/case** change is a reviewed baseline transaction, never a
source-only refresh.

### Structural zero (NOT public-release approval)

`--require-zero` requires zero findings in the **structural tier only**. This is
**structural zero**, not full public-release approval: the authoring/effect/
browser tiers stay `UNKNOWN` until their runners land, and the full release
aggregator is a later plan.

```bash
corepack pnpm conformance:satin            # normal gate (read-only)
corepack pnpm conformance:satin:diagnose   # non-mutating pre-baseline review
corepack pnpm conformance:satin:release    # structural zero (structural tier only)
```

### Satin mutation acknowledgements

Every Satin tier mutation is **non-CI**, requires `--review-digest sha256:...`
and `--write-inventory`, and additionally requires a **clean worktree** at
`captureSourceRef = git rev-parse HEAD` (the manifest records that exact commit
and the SHA-256 of `git ls-tree -r -z --full-tree <ref>`):

```text
SATIN_BASELINE_ACK=initial-bootstrap          # --capture-initial-baseline
SATIN_BASELINE_SHRINK_ACK=verified-remediation# --shrink-baseline
SATIN_INVENTORY_ACK=reviewed-refresh          # --write-inventory (always)
SATIN_REQUIREMENTS_ACK=reviewed-append        # --append-requirement-locks
SATIN_BASELINE_REVISE_ACK=reviewed-semantic-change # --revise-semantic-baseline
```

### Reviewed semantic-revision route

An initial reviewed requirement may declare `contract: null` (the user requires
the capability open but its reviewed scenarios/expected cases are undecided).
`--revise-semantic-baseline --revision-id <id> --change-set-digest sha256:...`
is the **only** append-only route that later gives such a `null` contract its
reviewed scenarios/cases, without making undeclared growth legal. It requires
strict-superset additions matching the ledger entry exactly, a new user/Figma/
product source for each changed meaning, no ID deletion/rename, and unrelated
findings byte-identical. Normal mode recomputes every revision-entry digest,
verifies the parent chain and compares the cumulative ledger-prefix digest with
the manifest; editing/reordering/deleting any historical revision fails and can
never pass as an inventory/source-only refresh.
