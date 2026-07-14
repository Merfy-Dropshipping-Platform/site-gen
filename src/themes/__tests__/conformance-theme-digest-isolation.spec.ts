/**
 * Task 2 — digest provenance-boundary isolation.
 *
 * The landed Bloom loader hashed the whole `src/themes/conformance/**` directory
 * as one broad input. Task 2 replaces that with an explicit partition on each
 * theme's source adapter:
 *   - `sharedDigestInputs` — the generic implementation + central registry
 *     wiring, IDENTICAL across bloom/satin;
 *   - `themeDigestInputs` — ONLY the selected theme's owned files (its
 *     descriptor, source adapter, release contract, generator registry,
 *     package/standalone bytes and tracked normative artifacts).
 *
 * This suite is the regression that proves the boundary holds:
 *   - a theme-owned byte changes ONLY that theme's `sourceDigest`;
 *   - a shared-core byte changes BOTH themes' `sourceDigest`.
 * It mutates the actual previously-dangerous adapter/contract/requirements
 * boundary, not just a standalone runtime file Bloom never hashed.
 *
 * Task 3 artifacts (`satin-release-contract.ts`,
 * `conformance/decisions/satin.v1.md`,
 * `conformance/requirements/satin.{v1,revisions}.json`) do not exist yet. They
 * are ALREADY wired into the theme digest inputs (ENOENT-tolerant), so this test
 * proves the boundary for those paths by creating throwaway bytes at the wired
 * path, asserting, then removing them — it never invents their real content.
 *
 * Requires the four-step build for both bloom and satin snapshots.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';
import { BLOOM_SOURCE_ADAPTER } from '../conformance/bloom-source-adapter';
import { SATIN_SOURCE_ADAPTER } from '../conformance/satin-source-adapter';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

type Owner = 'bloom' | 'satin';

/** Compute one theme's rolled-up source digest from real disk state. */
async function digestTheme(owner: Owner): Promise<string> {
  const snap = await loadThemeSourceSnapshot(owner);
  return snap.sourceDigest;
}

/**
 * Temporarily mutate a repo-relative path (create if absent, append if present),
 * run `fn`, then restore the EXACT prior state (bytes or absence). This is
 * ENOENT-tolerant: a Task-3-pending path is created then removed, restoring the
 * original absence without inventing real content.
 */
async function withMutatedPath(
  relPath: string,
  fn: () => Promise<void>,
): Promise<void> {
  const abs = resolve(SITES_ROOT, relPath);
  const existedBefore = existsSync(abs);
  const original = existedBefore ? readFileSync(abs) : null;
  const dirExistedBefore = existsSync(dirname(abs));
  try {
    if (!dirExistedBefore) mkdirSync(dirname(abs), { recursive: true });
    const next = existedBefore
      ? Buffer.concat([original!, Buffer.from('\n// digest-isolation churn\n')])
      : Buffer.from('digest-isolation throwaway (Task-3 pending)\n');
    writeFileSync(abs, next);
    await fn();
  } finally {
    if (existedBefore) {
      writeFileSync(abs, original!);
    } else {
      rmSync(abs, { force: true });
      // Only prune a directory we created; never remove a pre-existing one.
      if (!dirExistedBefore && existsSync(dirname(abs))) {
        rmSync(dirname(abs), { recursive: true, force: true });
      }
    }
  }
}

// The exact theme-owned / shared cases from the plan.
const THEME_OWNED_CASES: ReadonlyArray<readonly [Owner, string]> = [
  ['satin', 'src/themes/conformance/theme-descriptors/satin.ts'],
  ['satin', 'src/themes/conformance/satin-source-adapter.ts'],
  ['satin', 'src/themes/conformance/satin-release-contract.ts'],
  ['satin', 'conformance/decisions/satin.v1.md'],
  ['satin', 'conformance/requirements/satin.v1.json'],
  ['satin', 'conformance/requirements/satin.revisions.json'],
  ['bloom', 'src/themes/conformance/theme-descriptors/bloom.ts'],
  ['bloom', 'src/themes/conformance/bloom-source-adapter.ts'],
  ['bloom', 'src/themes/conformance/bloom-release-contract.ts'],
];

const SHARED_CASE = 'packages/theme-contract/conformance/types.ts';

describe('digest partition coverage — every wired input is shared XOR one theme', () => {
  it('classifies each theme-owned case path as belonging to exactly one theme list', () => {
    for (const [owner, path] of THEME_OWNED_CASES) {
      const owned =
        owner === 'satin'
          ? SATIN_SOURCE_ADAPTER.themeDigestInputs
          : BLOOM_SOURCE_ADAPTER.themeDigestInputs;
      const other =
        owner === 'satin'
          ? BLOOM_SOURCE_ADAPTER.themeDigestInputs
          : SATIN_SOURCE_ADAPTER.themeDigestInputs;
      // The path (or its parent dir entry) is in exactly the owner's list.
      const inOwned = owned.some((e) => path === e || path.startsWith(`${e}/`));
      const inOther = other.some((e) => path === e || path.startsWith(`${e}/`));
      expect(inOwned).toBe(true);
      expect(inOther).toBe(false);
    }
  });

  it('shares the exact same shared-core list between bloom and satin (no drift)', () => {
    expect(SATIN_SOURCE_ADAPTER.sharedDigestInputs).toEqual(
      BLOOM_SOURCE_ADAPTER.sharedDigestInputs,
    );
    // The shared case is inside the shared conformance dir entry.
    expect(
      SATIN_SOURCE_ADAPTER.sharedDigestInputs.some((e) =>
        SHARED_CASE.startsWith(`${e}/`),
      ),
    ).toBe(true);
  });

  it('no theme-owned path leaks into the shared list', () => {
    for (const [, path] of THEME_OWNED_CASES) {
      for (const shared of SATIN_SOURCE_ADAPTER.sharedDigestInputs) {
        expect(path === shared || path.startsWith(`${shared}/`)).toBe(false);
      }
    }
  });
});

describe('digest isolation — theme-owned bytes stay owned, shared bytes are shared', () => {
  it('isolates theme-owned bytes and shares only core bytes', async () => {
    const baseSatin = await digestTheme('satin');
    const baseBloom = await digestTheme('bloom');

    for (const [owner, path] of THEME_OWNED_CASES) {
      const other: Owner = owner === 'satin' ? 'bloom' : 'satin';
      // eslint-disable-next-line no-await-in-loop
      await withMutatedPath(path, async () => {
        const ownerDigest = await digestTheme(owner);
        const otherDigest = await digestTheme(other);
        // The owner's digest MUST change (the path is wired into its inputs).
        expect(ownerDigest).not.toBe(owner === 'satin' ? baseSatin : baseBloom);
        // The other theme's digest MUST NOT change.
        expect(otherDigest).toBe(other === 'satin' ? baseSatin : baseBloom);
      });
    }

    // Restored state → both digests return to baseline.
    expect(await digestTheme('satin')).toBe(baseSatin);
    expect(await digestTheme('bloom')).toBe(baseBloom);

    // A shared-core byte changes BOTH themes' digests.
    await withMutatedPath(SHARED_CASE, async () => {
      expect(await digestTheme('satin')).not.toBe(baseSatin);
      expect(await digestTheme('bloom')).not.toBe(baseBloom);
    });

    // And restoring the shared byte returns both to baseline.
    expect(await digestTheme('satin')).toBe(baseSatin);
    expect(await digestTheme('bloom')).toBe(baseBloom);
  }, 240_000); // many full snapshots (child-process import checks) — slow but real.
});
