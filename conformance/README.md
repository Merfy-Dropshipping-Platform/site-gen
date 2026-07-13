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
