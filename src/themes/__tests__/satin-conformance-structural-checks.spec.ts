/**
 * Task 5 — Satin known-current structural classification, driven by the REAL
 * pipeline.
 *
 * The plan's known-current classification table is kept below AS THE EXPECTED
 * REFERENCE (id + status + expectedCode + observedCode + source ref). The ACTUAL
 * findings are produced by the REAL Satin structural checker
 * (`runSatinStructuralChecks`) run against the REAL Satin source snapshot +
 * real source/renderer facts (`buildSatinStructuralFacts`). The suite asserts the
 * real pipeline emits every table row — it NEVER compares hardcoded literals to
 * themselves.
 *
 * The renderer facts are captured by the compiled mapped-renderer child-process
 * probes (Slideshow alias precedence / position domain, MultiColumns stored
 * shape); every other fact is a deterministic structural probe over the real
 * theme bytes. A missing expected row is a FAILURE, never a silent fix: if the
 * real source ever disproves a table row the pipeline simply won't emit it and
 * this suite fails loudly, forcing a reviewed source-diff rather than a quiet
 * fixture edit.
 *
 * The synthetic-complete fixture (every structural source/contract repaired)
 * yields ZERO structural issues while behavior tiers stay UNKNOWN — repairing
 * structure never awards a behavior/browser PASS.
 *
 * Requires the four-step build (build → build:blocks → build:theme-sections
 * satin → run-theme-build satin) so the compiled renderer probes exist.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collectTierGateFindings,
  aggregateReleaseStatus,
  fingerprintStructuralIssue,
  type TieredStructuralIssue,
  type TieredCapabilityRecord,
  type CapabilityStatus,
} from '../../../packages/theme-contract/conformance';
import { SATIN_RELEASE_CONTRACT } from '../conformance/satin-release-contract';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';
import { buildSatinStructuralFacts } from '../conformance/satin-structural-facts';
import { runSatinStructuralChecks } from '../conformance/satin-structural-checks';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEME = 'satin';

// ---------------------------------------------------------------------------
// The known-current classification table — the EXPECTED reference only.
// Every row is grounded on a file/selector observed during the audit; the REAL
// pipeline must reproduce each one from the live source.
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  status: Exclude<CapabilityStatus, 'PASS' | 'UNKNOWN'>;
  expectedCode: string;
  observedCode: string;
  ref: string;
};

const TABLE: readonly Row[] = [
  // NOTE: three formerly-listed Slideshow/MultiColumns rows are REMOVED because
  // the underlying defects are REMEDIATED in source (proven, not silently
  // dropped):
  //   - satin.section.Slideshow.slides[].alias-precedence — the renderer now reads
  //     canonical-first (`image`/`button.link.href` before `imageUrl`/`ctaUrl`).
  //   - satin.section.Slideshow.slides[].position.renderer-domain — the renderer
  //     now emits nine DISTINCT 2D layouts (justify×items) for the 9-cell grid.
  //   - satin.section.MultiColumns.columns[].stored-shape — `containerEnabled` is
  //     in the Zod schema (no longer stripped) and the renderer reads
  //     canonical-first (`title`→heading, `description`→text, `image`→imageUrl).
  // The real pipeline no longer emits them; their absence is the remediation
  // proof (the tier-shrink), while the remaining rows below must still be emitted.
  {
    id: 'satin.block.Catalog.manifest-declaration',
    status: 'GAP',
    expectedCode: 'catalog-declared-in-theme-json',
    observedCode: 'catalog-absent-from-theme-json-blocks',
    ref: 'packages/theme-satin/theme.json#/blocks',
  },
  {
    id: 'satin.flow.wishlist.feature',
    status: 'GAP',
    expectedCode: 'wishlist-feature-true',
    observedCode: 'wishlist-feature-false',
    ref: 'packages/theme-satin/theme.json#/features/wishlist',
  },
  {
    id: 'satin.flow.page-generation.puck-driven-pages',
    status: 'GAP',
    expectedCode: 'puck-driven-pages-declared',
    observedCode: 'puck-driven-pages-absent',
    ref: 'packages/theme-satin/theme.json#/features',
  },
  {
    id: 'satin.page.page-checkout-result.manifest',
    status: 'GAP',
    expectedCode: 'page-in-manifest',
    observedCode: 'page-absent',
    ref: 'packages/theme-satin/theme.json#/pages',
  },
  {
    id: 'satin.page.page-checkout-result.seed',
    status: 'GAP',
    expectedCode: 'page-seed-present',
    observedCode: 'page-seed-absent',
    ref: 'packages/theme-satin/theme.json#/pages',
  },
  {
    id: 'satin.page.page-checkout-result.live-output',
    status: 'GAP',
    expectedCode: 'checkout-result-generated',
    observedCode: 'checkout-result-not-generated',
    ref: 'src/generator/build.service.ts#/composeContentPagesIntoDist',
  },
  {
    id: 'satin.flow.auth.demo-routes',
    status: 'GAP',
    expectedCode: 'no-demo-forms',
    observedCode: 'demo-forms-coexist',
    ref: 'themes/satin/src/pages/login.astro',
  },
  {
    id: 'satin.flow.auth.return-parameter',
    status: 'GAP',
    expectedCode: 'single-canonical-return-param',
    observedCode: 'next-and-redirect-diverge',
    ref: 'themes/satin/src/pages/login.astro#/return',
  },
  {
    id: 'satin.flow.auth.login-return-propagation',
    status: 'GAP',
    expectedCode: 'login-preserves-return',
    observedCode: 'login-goes-to-account',
    ref: 'themes/satin/src/pages/login.astro#/navTo',
  },
  {
    id: 'satin.flow.auth.verify-return-propagation',
    status: 'GAP',
    expectedCode: 'verify-preserves-return',
    observedCode: 'verify-return-lost',
    ref: 'themes/satin/src/pages/verify.astro',
  },
  {
    id: 'satin.flow.checkout-config.require-auth-live',
    status: 'GAP',
    expectedCode: 'live-receives-auth-config',
    observedCode: 'live-loses-auth-config',
    ref: 'src/generator/build.service.ts#/checkout-auth',
  },
  {
    id: 'satin.flow.checkout-config.scheme-initial-injection',
    status: 'GAP',
    expectedCode: 'same-scheme-live-and-preview',
    observedCode: 'scheme-context-diverges',
    ref: 'src/generator/build.service.ts#/checkout-scheme',
  },
  {
    id: 'satin.flow.search.suggestions-data-source',
    status: 'GAP',
    expectedCode: 'suggestions-from-catalog',
    observedCode: 'suggestions-from-demo',
    ref: 'themes/satin/src/scripts/gsap/search.ts',
  },
  {
    id: 'satin.flow.search.catalog-read-q',
    status: 'GAP',
    expectedCode: 'catalog-consumes-q',
    observedCode: 'catalog-ignores-q',
    ref: 'themes/satin/src/pages/catalog.astro#/q',
  },
  {
    id: 'satin.flow.legal.footer-refund',
    status: 'GAP',
    expectedCode: 'footer-target-/legal/refund',
    observedCode: 'footer-target-mismatch',
    ref: 'themes/satin/src/components/Footer.astro#/refund',
  },
  {
    id: 'satin.flow.legal.footer-privacy',
    status: 'GAP',
    expectedCode: 'footer-target-/legal/privacy',
    observedCode: 'footer-target-mismatch',
    ref: 'themes/satin/src/components/Footer.astro#/privacy',
  },
  {
    id: 'satin.flow.legal.footer-tos',
    status: 'GAP',
    expectedCode: 'footer-target-/legal/terms',
    observedCode: 'footer-target-mismatch',
    ref: 'themes/satin/src/components/Footer.astro#/tos',
  },
  {
    id: 'satin.flow.legal.footer-shipping',
    status: 'GAP',
    expectedCode: 'footer-target-/legal/shipping-policy',
    observedCode: 'footer-target-mismatch',
    ref: 'themes/satin/src/components/Footer.astro#/shipping',
  },
  {
    id: 'satin.flow.legal.checkout-cookies',
    status: 'GAP',
    expectedCode: 'cookies-policy-model',
    observedCode: 'cookies-link-without-route',
    ref: 'themes/satin/src/pages/checkout.astro#/cookies',
  },
  {
    id: 'satin.flow.publications.canonical-route',
    status: 'NEEDS_DECISION',
    expectedCode: 'canonical-publications-route',
    observedCode: 'route-conflict',
    ref: 'themes/satin/src/pages/blog/index.astro',
  },
  {
    id: 'satin.flow.publications.detail-route',
    status: 'GAP',
    expectedCode: 'working-merchant-detail-route',
    observedCode: 'detail-route-missing',
    ref: 'themes/satin/src/pages/blog/[...slug].astro',
  },
  {
    id: 'satin.flow.publications.merchant-data',
    status: 'GAP',
    expectedCode: 'merchant-data-source',
    observedCode: 'demo-fallback',
    ref: 'themes/satin/src/pages/blog/index.astro#/data-source',
  },
  {
    id: 'satin.flow.cart.drawer-cart-section-source',
    status: 'GAP',
    expectedCode: 'resolver-reads-cart-section',
    observedCode: 'resolver-reads-legacy-cartbody',
    ref: 'themes/satin/src/scripts/gsap/cart-drawer.ts#/source',
  },
  {
    id: 'satin.flow.cart.safe-dom',
    status: 'GAP',
    expectedCode: 'sanitizer-dominates-sink',
    observedCode: 'unsafe-html-sink',
    ref: 'themes/satin/src/lib/cart.ts#/sink',
  },
  {
    id: 'satin.flow.account.orders-safe-dom',
    status: 'GAP',
    expectedCode: 'sanitizer-dominates-sink',
    observedCode: 'unsafe-html-sink',
    ref: 'themes/satin/src/pages/account/orders.astro#/sink',
  },
  {
    id: 'satin.flow.account.order-detail-safe-dom',
    status: 'GAP',
    expectedCode: 'sanitizer-dominates-sink',
    observedCode: 'unsafe-html-sink',
    ref: 'themes/satin/src/pages/account/order.astro#/sink',
  },
  {
    id: 'satin.flow.checkout-result.confirmation-grant',
    status: 'GAP',
    expectedCode: 'scoped-confirmation-grant',
    observedCode: 'raw-uuid-access',
    ref: 'themes/satin/src/pages/checkout-result.astro#/order-access',
  },
  {
    id: 'satin.flow.checkout-result.status-not-found',
    status: 'GAP',
    expectedCode: 'terminal-not-found',
    observedCode: 'reported-as-pending',
    ref: 'themes/satin/src/pages/checkout-result.astro#/status',
  },
  {
    id: 'satin.flow.merchant-order-settings.address.persistence',
    status: 'GAP',
    expectedCode: 'address-options-persist',
    observedCode: 'address-options-noop',
    ref: 'themes/satin/src/pages/checkout.astro#/address',
  },
  {
    id: 'satin.flow.merchant-order-settings.contact.persistence',
    status: 'GAP',
    expectedCode: 'contact-options-persist',
    observedCode: 'contact-options-noop',
    ref: 'themes/satin/src/pages/checkout.astro#/contact',
  },
  {
    id: 'satin.flow.merchant-order-settings.processing.persistence',
    status: 'GAP',
    expectedCode: 'processing-options-persist',
    observedCode: 'processing-options-noop',
    ref: 'themes/satin/src/pages/checkout.astro#/processing',
  },
  {
    id: 'satin.flow.merchant-order-settings.customer-info.persistence',
    status: 'GAP',
    expectedCode: 'customer-info-options-persist',
    observedCode: 'customer-info-options-noop',
    ref: 'themes/satin/src/pages/checkout.astro#/customer-info',
  },
  {
    id: 'satin.flow.merchant-order-settings.persisted-mapping',
    status: 'NEEDS_DECISION',
    expectedCode: 'canonical-key-value-mapping',
    observedCode: 'mapping-unresolved',
    ref: 'themes/satin/src/pages/checkout.astro#/persisted-mapping',
  },
  // --- explicit authoring/default/lifecycle decisions (plan lines 1046-1050) ---
  {
    id: 'satin.decision.multirows.behavior',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-multirows-behavior',
    observedCode: 'multirows-behavior-open',
    ref: 'themes/satin/src/components/sections/MultiRows.astro',
  },
  {
    id: 'satin.decision.footer.groups-defaults',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-footer-groups-defaults',
    observedCode: 'footer-groups-defaults-open',
    ref: 'themes/satin/src/components/Footer.astro',
  },
  {
    id: 'satin.decision.imagewithtext.alignment',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-imagewithtext-alignment',
    observedCode: 'imagewithtext-alignment-open',
    ref: 'themes/satin/src/components/sections/ImageWithText.astro',
  },
  {
    id: 'satin.decision.collapsiblesection.sidebar-layout',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-collapsiblesection-sidebar-layout',
    observedCode: 'collapsiblesection-sidebar-layout-open',
    ref: 'themes/satin/src/components/sections/CollapsibleSection.astro',
  },
  {
    id: 'satin.decision.header.recursion-depth',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-header-recursion-depth',
    observedCode: 'header-recursion-depth-open',
    ref: 'themes/satin/src/components/Header.astro',
  },
  {
    id: 'satin.decision.logo.migration-cohorts',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-logo-migration-cohorts',
    observedCode: 'logo-migration-cohorts-open',
    ref: 'themes/satin/src/layouts/Layout.astro',
  },
  {
    id: 'satin.decision.version-domain.meaning',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-version-domain-meaning',
    observedCode: 'version-domain-meaning-open',
    ref: 'packages/theme-satin/theme.json',
  },
  {
    id: 'satin.decision.lifecycle.fresh-default-cohort',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-fresh-default-cohort',
    observedCode: 'fresh-default-cohort-open',
    ref: 'packages/theme-satin/theme.json#/pages',
  },
  {
    id: 'satin.decision.lifecycle.switch-reseed-preservation',
    status: 'NEEDS_DECISION',
    expectedCode: 'reviewed-switch-reseed-preservation',
    observedCode: 'switch-reseed-preservation-open',
    ref: 'packages/theme-satin/theme.json#/pages',
  },
];

/** The 33 canonical known-current semantic rows the plan enumerates AFTER the
 *  three remediated Slideshow/MultiColumns rows were shrunk out (was 36). The
 *  ≥37 floor stays met by the 33 semantic rows + the explicit
 *  lifecycle/authoring decisions (42 total structural findings). */
const SEMANTIC_ROWS = TABLE.filter((r) => !r.id.startsWith('satin.decision.'));

/** Strip the `#/selector` from a ref → repo-relative file path. */
function refFile(ref: string): string {
  const i = ref.indexOf('#');
  return i === -1 ? ref : ref.slice(0, i);
}

// ---------------------------------------------------------------------------
// The REAL current-source structural issue set (pipeline, not literals).
// ---------------------------------------------------------------------------

let CURRENT: TieredStructuralIssue[] = [];

beforeAll(async () => {
  const snapshot = await loadThemeSourceSnapshot(THEME);
  const facts = buildSatinStructuralFacts(snapshot);
  CURRENT = runSatinStructuralChecks(facts, SATIN_RELEASE_CONTRACT);
}, 120_000);

/** The synthetic-complete fixture: every STRUCTURAL source/contract repaired. */
function completeIssues(): TieredStructuralIssue[] {
  return [];
}

/**
 * A behavior capability that stays UNKNOWN even after structural repair — the
 * synthetic-complete fixture must NOT turn a browser/effect row into PASS.
 */
function behaviorUnknownRow(): TieredCapabilityRecord {
  return {
    id: 'satin.flow.checkout-result.confirmation-grant',
    theme: THEME,
    surface: 'flow',
    capability: 'checkout-result.confirmation-grant',
    scenarios: [],
    modes: ['live'],
    viewports: ['desktop'],
    sources: [{ kind: 'code', ref: 'themes/satin/src/pages/checkout-result.astro#/order-access' }],
    status: 'UNKNOWN',
    failureIds: [],
    requiredTiers: ['structural', 'effect', 'browser'],
    tierStatuses: { structural: 'PASS', effect: 'UNKNOWN', browser: 'UNKNOWN' },
    caseResults: [],
  };
}

describe('Satin known-current classification — REAL pipeline reproduces the table', () => {
  it('emits every semantic table row from the real source snapshot', () => {
    const byId = new Map(CURRENT.map((i) => [i.id, i]));
    const missing: string[] = [];
    for (const row of SEMANTIC_ROWS) {
      const actual = byId.get(row.id);
      if (!actual) {
        missing.push(row.id);
        continue;
      }
      // The real pipeline's finding must carry the table's stable codes+status.
      expect(actual.status).toBe(row.status);
      expect(actual.expectedCode).toBe(row.expectedCode);
      expect(actual.observedCode).toBe(row.observedCode);
      expect(actual.tier).toBe('structural');
    }
    // A missing expected row is a FAILURE, never a silent fix.
    expect(missing).toEqual([]);
  });

  it('reproduces at least the 37 enumerated semantic + decision findings', () => {
    // 33 semantic rows (36 − 3 remediated) + the explicit lifecycle/authoring
    // decisions ≥ 37 (the real pipeline emits 42 total structural findings).
    expect(CURRENT.length).toBeGreaterThanOrEqual(37);
    // No emitted id may be a PASS-status leak.
    for (const i of CURRENT) expect(i.status).not.toBe('PASS');
  });

  it('cites a real repo-relative source file for every finding', () => {
    const notYetGenerated = new Set([
      'themes/satin/src/pages/checkout-result.astro', // the missing page (GAP)
    ]);
    for (const i of CURRENT) {
      for (const src of i.sources) {
        const file = refFile(src.ref);
        if (notYetGenerated.has(file) || /\[/.test(file)) continue;
        expect(existsSync(resolve(SITES_ROOT, file))).toBe(true);
      }
    }
  });

  it('marks the two canonical decisions as NEEDS_DECISION (never a silent waiver)', () => {
    const byId = new Map(CURRENT.map((i) => [i.id, i]));
    for (const id of [
      'satin.flow.publications.canonical-route',
      'satin.flow.merchant-order-settings.persisted-mapping',
    ]) {
      expect(byId.get(id)?.status).toBe('NEEDS_DECISION');
      expect(SATIN_RELEASE_CONTRACT.decisionCapabilityIds).toContain(id);
    }
  });

  it('produces stable, distinct fingerprints for every current finding', () => {
    const fps = CURRENT.map(fingerprintStructuralIssue);
    // deterministic (re-fingerprinting yields the same value).
    expect(CURRENT.map(fingerprintStructuralIssue)).toEqual(fps);
    // distinct per finding.
    expect(new Set(fps).size).toBe(CURRENT.length);
  });
});

describe('Satin structural gate — current vs synthetic-complete', () => {
  it('the current fixture reports the table as structural findings (data, not a crash)', () => {
    const findings = collectTierGateFindings('structural', CURRENT, [], new Map());
    const ids = findings.map((f) => f.id);
    for (const row of SEMANTIC_ROWS) expect(ids).toContain(row.id);
    expect(findings.every((f) => f.tier === 'structural')).toBe(true);
  });

  it('the synthetic-complete fixture has ZERO structural issues but keeps behavior UNKNOWN', () => {
    const structural = collectTierGateFindings(
      'structural',
      completeIssues(),
      [behaviorUnknownRow()],
      new Map(),
    );
    expect(structural).toEqual([]);

    const effect = collectTierGateFindings('effect', [], [behaviorUnknownRow()], new Map());
    expect(effect.length).toBeGreaterThan(0);
    expect(effect.every((f) => f.tier === 'effect')).toBe(true);

    expect(aggregateReleaseStatus([behaviorUnknownRow()])).toBe('UNKNOWN');
  });
});
