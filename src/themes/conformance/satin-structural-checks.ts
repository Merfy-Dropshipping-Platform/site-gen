/**
 * Satin structural conformance checker (Task 5-prep, the REAL Satin pipeline).
 *
 * Bloom's `runStructuralChecks` is anchored on `BLOOM_RELEASE_CONTRACT`; this
 * module is its Satin-owned symmetric counterpart. It never imports Bloom policy
 * and never lives inside the generic `structural-checks.ts` (which carries the
 * Bloom Publications/cart-drawer/Benefits invariants). It answers ONE question:
 *
 *   given the REAL Satin source snapshot + a set of REAL source/renderer facts
 *   observed on disk, which `SATIN_RELEASE_CONTRACT` requirements are unmet?
 *
 * Every emitted `TieredStructuralIssue` is DERIVED from a fact, never a literal:
 *   - manifest/block/page/feature findings read the generic snapshot
 *     (`themeJson.features`, `themeJson.blocks`, `themeJson.pages`,
 *     `hasCheckoutResultPage`, `resolutions`, `registry`);
 *   - renderer-behavior findings (Slideshow alias precedence / position domain,
 *     MultiColumns stored shape) read facts captured by the compiled
 *     mapped-renderer child-process probes (`render-satin-slideshow.mjs`,
 *     `render-satin-multicolumns.mjs`) — the checker reads a fact object, it
 *     never re-renders per call;
 *   - flow findings (auth/search/legal/publications/cart/account/checkout-config/
 *     checkout-result/merchant-order-settings) read deterministic structural
 *     probes over the REAL theme source bytes (the same bytes the digest hashes).
 *
 * A finding disappears ONLY when its underlying fact says the defect is absent.
 * A finding is NEVER forced: if the real source contradicts a table row, the
 * checker simply does not emit it and the caller's diff surfaces the mismatch.
 *
 * `expectedCode`/`observedCode` are STABLE machine codes; canonical facts are
 * redacted deterministic values (no timestamps, no absolute paths). Arbitrary
 * IDs are routed through `encodeOpaqueSegment`; the table's dotted/`[]` segments
 * are valid `makeCapabilityId` segments and stay human-readable.
 */

import { makeCapabilityId } from '../../../packages/theme-contract/conformance';
import type { TieredStructuralIssue } from '../../../packages/theme-contract/conformance';
import type { ThemeReleaseContract } from './release-contracts';
import type { ThemeSourceSnapshot } from './source-types';

const SATIN = 'satin';

// ---------------------------------------------------------------------------
// Observed fact model
// ---------------------------------------------------------------------------

/**
 * Facts about the two Satin renderers whose behavior can only be observed by
 * rendering the REAL compiled mapped module (never by reading source text). These
 * are captured ONCE by the child-process probes and handed to the checker.
 */
export interface SatinRendererFacts {
  /** the compiled Slideshow renderer read the LEGACY imageUrl before canonical image. */
  slideshowLegacyImageWins: boolean;
  /** the compiled Slideshow renderer read the LEGACY ctaUrl before canonical button.link. */
  slideshowLegacyCtaWins: boolean;
  /**
   * How many DISTINCT 2D layouts (`justify|items` = vertical × horizontal on the
   * flex-row canvas) the nine canonical positions produce. The sidebar exposes a
   * 9-cell grid; the renderer covers it iff this count reaches the sidebar count.
   */
  slideshowRendererPositionCount: number;
  /** how many positions the sidebar exposes (the 9-cell canonical grid). */
  slideshowSidebarPositionCount: number;
  /**
   * The compiled MultiColumns schema STRIPS the `containerEnabled` toggle key on
   * safeParse (field↔schema drift). `false` after the schema adds the key.
   */
  multiColumnsSchemaStripsContainerEnabled: boolean;
  /**
   * The MultiColumns renderer reads canonical-first for EVERY aliased leaf
   * (`title`→heading, `description`→text, `image`→imageUrl) so the stored-shape
   * ambiguity is resolved deterministically. `true` after the renderer fix.
   */
  multiColumnsRendererCanonicalFirst: boolean;
}

/**
 * Structural facts read from the REAL Satin source bytes via deterministic
 * probes. Each field is a single boolean/enum observation grounded on a concrete
 * file+line; the checker maps `contract requirement × fact → issue`.
 */
export interface SatinSourceFacts {
  // --- auth ---------------------------------------------------------------
  /** `/auth/*` demo forms coexist with the working `/login` route. */
  authDemoRoutesCoexist: boolean;
  /** login/account use `redirect` while checkout uses `next` (params diverge). */
  authReturnParams: string[];
  /** successful login falls back to `/account` (does not preserve return). */
  authLoginFallbackTarget: string;
  /** verify success navigates to `/account` (return NOT preserved). */
  authVerifyPreservesReturn: boolean;

  // --- search -------------------------------------------------------------
  /** the search index is built from a LOCAL demo product module. */
  searchSuggestionsFromDemo: boolean;
  /** the Catalog page consumes the submitted `q` query key. */
  catalogReadsSubmittedQ: boolean;

  // --- legal --------------------------------------------------------------
  /**
   * The footer's default information-column fallback maps a `/legal/<slug>`
   * target for each key, keyed by canonical slug → present.
   */
  footerLegalTargets: Readonly<Record<string, boolean>>;
  /** the cookies link is emitted with a generated `/legal/*` policy route. */
  checkoutCookiesHasGeneratedRoute: boolean;

  // --- publications -------------------------------------------------------
  /** the publications list/detail source falls back to a static/demo collection. */
  publicationsFallsBackToDemo: boolean;
  /** a working merchant detail route resolves the emitted card link. */
  publicationsDetailRouteResolves: boolean;

  // --- cart ---------------------------------------------------------------
  /** the drawer scheme resolver inspects legacy CartBody/CartSummary block types. */
  cartResolverInspectsLegacyTypes: string[];
  /** the migrated CartSection block type the resolver SHOULD inspect. */
  cartMigratedTarget: string;
  /** an allowlisted sanitizer dominates the cart line-name HTML sink. */
  cartSinkSanitized: boolean;

  // --- account ------------------------------------------------------------
  /** an allowlisted sanitizer dominates the orders-list HTML sink. */
  accountOrdersSinkSanitized: boolean;
  /** an allowlisted sanitizer dominates the order-detail HTML sink. */
  accountOrderDetailSinkSanitized: boolean;

  // --- checkout-config ----------------------------------------------------
  /** the preview path injects the checkout auth-requirement config. */
  checkoutConfigAuthInPreview: boolean;
  /** the LIVE path injects the checkout auth-requirement config. */
  checkoutConfigAuthInLive: boolean;
  /** live composition & initial preview inject the SAME scheme context. */
  checkoutConfigSchemeConsistent: boolean;

  // --- merchant order settings -------------------------------------------
  /** a storefront form actually applies each visible order-setting category. */
  orderSettingApplied: Readonly<Record<string, boolean>>;

  // --- checkout-result ----------------------------------------------------
  /** checkout-result exposes a scoped confirmation grant (not a raw UUID access). */
  checkoutResultScopedGrant: boolean;
  /** an absent order reports a TERMINAL not-found (not `pending`). */
  checkoutResultTerminalNotFound: boolean;
}

/** The complete observed Satin fact object handed to the checker. */
export interface SatinStructuralFacts {
  themeId: string;
  /** feature flags declared in theme.json.features. */
  features: Readonly<Record<string, boolean>>;
  /** block names declared in theme.json.blocks. */
  manifestBlockNames: readonly string[];
  /** page ids declared in theme.json.pages. */
  manifestPageIds: readonly string[];
  /** canonical block-resolution names (registry+base resolutions). */
  resolutionNames: readonly string[];
  /** generator registry block names. */
  registryNames: readonly string[];
  /** true when a checkout-result / OrderConfirmation page exists in the manifest. */
  hasCheckoutResultPage: boolean;
  /** puckDrivenPages feature is declared. */
  puckDrivenPagesDeclared: boolean;
  /** Satin package pages exist (the seedable content-page sources). */
  packagePagesExist: boolean;
  renderer: SatinRendererFacts;
  source: SatinSourceFacts;
}

// ---------------------------------------------------------------------------
// Issue factory
// ---------------------------------------------------------------------------

const c = (...seg: [string, ...string[]]): string =>
  makeCapabilityId(SATIN, ...seg);

function issue(
  id: string,
  status: TieredStructuralIssue['status'],
  expectedCode: string,
  observedCode: string,
  detail: string,
  canonicalFacts: Record<string, unknown>,
  refs: string[],
): TieredStructuralIssue {
  return {
    id,
    theme: SATIN,
    tier: 'structural',
    status,
    expectedCode,
    observedCode,
    canonicalFacts,
    detail,
    sources: refs.map((ref) => ({ kind: 'code', ref })),
  };
}

/** Locate a required-flow's declared source refs by capability id. */
function refsFor(
  contract: ThemeReleaseContract<'satin'>,
  capabilityId: string,
  fallback: string[],
): string[] {
  const flow = contract.requiredFlows.find(
    (f) => f.capabilityId === capabilityId,
  );
  if (flow && flow.sourceRefs.length > 0) return [...flow.sourceRefs];
  return fallback;
}

// ---------------------------------------------------------------------------
// Section / block invariants (renderer + manifest facts)
// ---------------------------------------------------------------------------

function checkSections(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const r = facts.renderer;

  // Slideshow alias precedence: the compiled renderer reads a legacy alias
  // BEFORE the canonical nested value → GAP. Grounded on the render probe:
  // conflicting props → the legacy imageUrl/ctaUrl wins.
  if (r.slideshowLegacyImageWins || r.slideshowLegacyCtaWins) {
    out.push(
      issue(
        c('section', 'Slideshow', 'slides[]', 'alias-precedence'),
        'GAP',
        'canonical-nested-precedence',
        'legacy-alias-precedence',
        'compiled Slideshow renderer reads legacy aliases before canonical nested values',
        {
          legacyAliases: ['imageUrl', 'ctaUrl', 'button.link'],
          readBefore: 'canonical-nested',
        },
        ['themes/satin/src/components/sections/Slideshow.astro#/slides/imageUrl'],
      ),
    );
  }

  // Slideshow position renderer-domain: the renderer covers the sidebar's 9-cell
  // grid iff the nine canonical positions produce nine DISTINCT 2D layouts
  // (justify×items). A GAP is emitted only while the renderer distinguishes
  // FEWER 2D layouts than the sidebar exposes. Grounded on the render probe.
  if (r.slideshowRendererPositionCount < r.slideshowSidebarPositionCount) {
    out.push(
      issue(
        c('section', 'Slideshow', 'slides[]', 'position.renderer-domain'),
        'GAP',
        'renderer-covers-all-positions',
        'renderer-covers-legacy-three',
        'Slideshow renderer distinguishes fewer positions than the sidebar exposes',
        {
          sidebarPositions: r.slideshowSidebarPositionCount,
          rendererPositions: r.slideshowRendererPositionCount,
        },
        ['themes/satin/src/components/sections/Slideshow.astro#/slides/posCls'],
      ),
    );
  }

  // MultiColumns stored shape: the field↔schema↔renderer contract disagrees when
  // EITHER the schema strips the `containerEnabled` toggle (field↔schema drift)
  // OR the renderer does NOT read canonical-first (renderer must guess between
  // aliased leaves). The finding is resolved only when the schema keeps the
  // toggle AND the renderer resolves every alias canonical-first. Grounded on the
  // schema + section-render probes.
  const schemaDrift = r.multiColumnsSchemaStripsContainerEnabled;
  const rendererGuesses = !r.multiColumnsRendererCanonicalFirst;
  if (schemaDrift || rendererGuesses) {
    const disagreements: string[] = [];
    if (schemaDrift) disagreements.push('schema-strips-containerEnabled');
    if (rendererGuesses) disagreements.push('renderer-not-canonical-first');
    out.push(
      issue(
        c('section', 'MultiColumns', 'columns[]', 'stored-shape'),
        'GAP',
        'fields-schema-renderer-agree',
        'stored-shape-disagree',
        'MultiColumns fields/schema/renderer disagree on the stored column shape',
        { disagreements },
        [
          'packages/theme-satin/blocks/MultiColumns/MultiColumns.puckConfig.ts#/MultiColumnItemSchema',
        ],
      ),
    );
  }
}

function checkBlocks(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  // Catalog manifest declaration: registry has Catalog, theme.json.blocks omits it.
  const registryHasCatalog =
    facts.registryNames.includes('Catalog') ||
    facts.resolutionNames.includes('Catalog');
  const themeJsonHasCatalog = facts.manifestBlockNames.includes('Catalog');
  if (registryHasCatalog && !themeJsonHasCatalog) {
    out.push(
      issue(
        c('block', 'Catalog', 'manifest-declaration'),
        'GAP',
        'catalog-declared-in-theme-json',
        'catalog-absent-from-theme-json-blocks',
        'Catalog is a registry/physical block absent from theme.json.blocks',
        { registryHasCatalog: true, themeJsonHasCatalog: false },
        ['packages/theme-satin/theme.json#/blocks'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Feature / page invariants
// ---------------------------------------------------------------------------

function checkFeatures(
  facts: SatinStructuralFacts,
  contract: ThemeReleaseContract<'satin'>,
  out: TieredStructuralIssue[],
): void {
  // wishlist: contract requires it true; manifest declares it false → GAP.
  if (contract.requiredFeatures.wishlist === true && !facts.features.wishlist) {
    out.push(
      issue(
        c('flow', 'wishlist', 'feature'),
        'GAP',
        'wishlist-feature-true',
        'wishlist-feature-false',
        'wishlist route/UI/runtime exists while theme.json declares wishlist:false',
        { routePresent: true, declaredFeature: false },
        ['packages/theme-satin/theme.json#/features/wishlist'],
      ),
    );
  }

  // puck-driven pages: package pages exist while the feature flag is absent → GAP.
  if (facts.packagePagesExist && !facts.puckDrivenPagesDeclared) {
    out.push(
      issue(
        c('flow', 'page-generation', 'puck-driven-pages'),
        'GAP',
        'puck-driven-pages-declared',
        'puck-driven-pages-absent',
        'Satin package pages exist while features.puckDrivenPages is absent',
        { packagePagesExist: true, featureDeclared: false },
        ['packages/theme-satin/theme.json#/features'],
      ),
    );
  }
}

function checkCheckoutResultPage(
  facts: SatinStructuralFacts,
  contract: ThemeReleaseContract<'satin'>,
  out: TieredStructuralIssue[],
): void {
  const requiredByRegistry = contract.pages.some(
    (p) => p.id === 'page-checkout-result' || p.route === 'checkout-result',
  );
  if (!requiredByRegistry || facts.hasCheckoutResultPage) return;

  // manifest: registry requires the page, manifest omits it → GAP.
  out.push(
    issue(
      c('page', 'page-checkout-result', 'manifest'),
      'GAP',
      'page-in-manifest',
      'page-absent',
      'checkout-result is required by the registry but absent from the manifest',
      { requiredByRegistry: true, inManifest: false },
      ['packages/theme-satin/theme.json#/pages'],
    ),
  );
  // seed: no seed present → GAP.
  out.push(
    issue(
      c('page', 'page-checkout-result', 'seed'),
      'GAP',
      'page-seed-present',
      'page-seed-absent',
      'checkout-result has no Satin seed',
      { seedPresent: false },
      ['packages/theme-satin/theme.json#/pages'],
    ),
  );
  // live output: not generated → GAP.
  out.push(
    issue(
      c('page', 'page-checkout-result', 'live-output'),
      'GAP',
      'checkout-result-generated',
      'checkout-result-not-generated',
      'checkout success target is not generated for Satin',
      { liveOutput: false },
      ['src/generator/build.service.ts#/composeContentPagesIntoDist'],
    ),
  );
}

// ---------------------------------------------------------------------------
// Auth flow invariants
// ---------------------------------------------------------------------------

function checkAuth(
  facts: SatinStructuralFacts,
  contract: ThemeReleaseContract<'satin'>,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;

  if (s.authDemoRoutesCoexist) {
    out.push(
      issue(
        c('flow', 'auth', 'demo-routes'),
        'GAP',
        'no-demo-forms',
        'demo-forms-coexist',
        '/auth/* demo forms coexist with the working auth route',
        { demoFormsPresent: true },
        refsFor(contract, c('flow', 'auth', 'demo-routes'), [
          'themes/satin/src/pages/login.astro',
        ]),
      ),
    );
  }

  // return-parameter: more than one distinct return param → they diverge.
  if (new Set(s.authReturnParams).size > 1) {
    out.push(
      issue(
        c('flow', 'auth', 'return-parameter'),
        'GAP',
        'single-canonical-return-param',
        'next-and-redirect-diverge',
        'auth surfaces read divergent return parameters',
        { params: [...s.authReturnParams].sort() },
        ['themes/satin/src/pages/login.astro#/return'],
      ),
    );
  }

  // login-return-propagation: fallback target is /account (return lost on login).
  if (s.authLoginFallbackTarget === '/account') {
    out.push(
      issue(
        c('flow', 'auth', 'login-return-propagation'),
        'GAP',
        'login-preserves-return',
        'login-goes-to-account',
        'successful login falls back to /account and loses the checkout return',
        { fallback: '/account' },
        ['themes/satin/src/pages/login.astro#/navTo'],
      ),
    );
  }

  // verify-return-propagation: verify does not preserve the canonical return.
  if (!s.authVerifyPreservesReturn) {
    out.push(
      issue(
        c('flow', 'auth', 'verify-return-propagation'),
        'GAP',
        'verify-preserves-return',
        'verify-return-lost',
        'verify flow does not preserve one canonical return target',
        { canonicalReturnPreserved: false },
        ['themes/satin/src/pages/verify.astro'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// checkout-config flow invariants
// ---------------------------------------------------------------------------

function checkCheckoutConfig(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  // require-auth-live: preview receives auth config, live loses it → GAP.
  if (s.checkoutConfigAuthInPreview && !s.checkoutConfigAuthInLive) {
    out.push(
      issue(
        c('flow', 'checkout-config', 'require-auth-live'),
        'GAP',
        'live-receives-auth-config',
        'live-loses-auth-config',
        'preview injects the checkout auth config while the live path drops it',
        { preview: true, live: false },
        ['src/generator/build.service.ts#/checkout-auth'],
      ),
    );
  }
  // scheme-initial-injection: live vs initial preview inject different scheme.
  if (!s.checkoutConfigSchemeConsistent) {
    out.push(
      issue(
        c('flow', 'checkout-config', 'scheme-initial-injection'),
        'GAP',
        'same-scheme-live-and-preview',
        'scheme-context-diverges',
        'live composition and initial preview inject a different scheme/context',
        { liveVsInitialPreview: 'differ' },
        ['src/generator/build.service.ts#/checkout-scheme'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// search flow invariants
// ---------------------------------------------------------------------------

function checkSearch(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  if (s.searchSuggestionsFromDemo) {
    out.push(
      issue(
        c('flow', 'search', 'suggestions-data-source'),
        'GAP',
        'suggestions-from-catalog',
        'suggestions-from-demo',
        'header search suggestions are built from local demo products',
        { source: 'local-demo-products' },
        ['themes/satin/src/scripts/gsap/search.ts'],
      ),
    );
  }
  if (!s.catalogReadsSubmittedQ) {
    out.push(
      issue(
        c('flow', 'search', 'catalog-read-q'),
        'GAP',
        'catalog-consumes-q',
        'catalog-ignores-q',
        'the Satin catalog page does not consume the submitted q query key',
        { readsSubmittedQ: false },
        ['themes/satin/src/pages/catalog.astro#/q'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// legal flow invariants
// ---------------------------------------------------------------------------

/** canonical legal footer targets → their required `/legal/*` path. */
const LEGAL_FOOTER_TARGETS: ReadonlyArray<[string, string]> = [
  ['refund', '/legal/refund'],
  ['privacy', '/legal/privacy'],
  ['tos', '/legal/terms'],
  ['shipping', '/legal/shipping-policy'],
];

function checkLegal(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  for (const [key, expected] of LEGAL_FOOTER_TARGETS) {
    // A footer target is a GAP when the default info-column does NOT map the
    // canonical /legal/<slug> href.
    if (!s.footerLegalTargets[key]) {
      out.push(
        issue(
          c('flow', 'legal', `footer-${key}`),
          'GAP',
          `footer-target-${expected}`,
          'footer-target-mismatch',
          `footer does not map the canonical legal target ${expected}`,
          { expected },
          [`themes/satin/src/components/Footer.astro#/${key}`],
        ),
      );
    }
  }
  // checkout-cookies: cookies link emitted without a generated policy route.
  if (!s.checkoutCookiesHasGeneratedRoute) {
    out.push(
      issue(
        c('flow', 'legal', 'checkout-cookies'),
        'GAP',
        'cookies-policy-model',
        'cookies-link-without-route',
        'the cookies link is emitted without a generated policy route',
        { hasGeneratedRoute: false },
        ['themes/satin/src/pages/checkout.astro#/cookies'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// publications flow invariants
// ---------------------------------------------------------------------------

function checkPublications(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  // detail-route: emitted card link has no working merchant detail route.
  if (!s.publicationsDetailRouteResolves) {
    out.push(
      issue(
        c('flow', 'publications', 'detail-route'),
        'GAP',
        'working-merchant-detail-route',
        'detail-route-missing',
        'the emitted publication card link has no working merchant detail route',
        { cardLinkResolves: false },
        ['themes/satin/src/pages/blog/[...slug].astro'],
      ),
    );
  }
  // merchant-data: active detail/list source falls back to demo content.
  if (s.publicationsFallsBackToDemo) {
    out.push(
      issue(
        c('flow', 'publications', 'merchant-data'),
        'GAP',
        'merchant-data-source',
        'demo-fallback',
        'the publications list/detail source falls back to a static/demo collection',
        { fallsBackToDemo: true },
        ['themes/satin/src/pages/blog/index.astro#/data-source'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// cart / account safe-DOM invariants
// ---------------------------------------------------------------------------

function checkCartAndAccount(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;

  // drawer-cart-section-source: resolver inspects legacy CartBody/CartSummary,
  // not the migrated CartSection.
  if (
    s.cartResolverInspectsLegacyTypes.length > 0 &&
    !s.cartResolverInspectsLegacyTypes.includes(s.cartMigratedTarget)
  ) {
    out.push(
      issue(
        c('flow', 'cart', 'drawer-cart-section-source'),
        'GAP',
        'resolver-reads-cart-section',
        'resolver-reads-legacy-cartbody',
        'the cart-drawer scheme resolver inspects legacy CartBody/CartSummary, not the migrated CartSection',
        {
          inspects: [...s.cartResolverInspectsLegacyTypes].sort(),
          migratedTarget: s.cartMigratedTarget,
        },
        ['themes/satin/src/scripts/gsap/cart-drawer.ts#/source'],
      ),
    );
  }

  const safeDomSinks: ReadonlyArray<
    [string, boolean, string, string[]]
  > = [
    [
      c('flow', 'cart', 'safe-dom'),
      s.cartSinkSanitized,
      'cart',
      ['themes/satin/src/lib/cart.ts#/sink'],
    ],
    [
      c('flow', 'account', 'orders-safe-dom'),
      s.accountOrdersSinkSanitized,
      'account.orders',
      ['themes/satin/src/pages/account/orders.astro#/sink'],
    ],
    [
      c('flow', 'account', 'order-detail-safe-dom'),
      s.accountOrderDetailSinkSanitized,
      'account.order-detail',
      ['themes/satin/src/pages/account/order.astro#/sink'],
    ],
  ];
  for (const [id, sanitized, , refs] of safeDomSinks) {
    if (!sanitized) {
      out.push(
        issue(
          id,
          'GAP',
          'sanitizer-dominates-sink',
          'unsafe-html-sink',
          'API/product data reaches an unsafe HTML sink without an allowlisted adapter',
          { sanitizerDominates: false },
          refs,
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// checkout-result flow invariants
// ---------------------------------------------------------------------------

function checkCheckoutResultFlow(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  if (!s.checkoutResultScopedGrant) {
    out.push(
      issue(
        c('flow', 'checkout-result', 'confirmation-grant'),
        'GAP',
        'scoped-confirmation-grant',
        'raw-uuid-access',
        'raw order UUID access lacks the approved scoped confirmation grant',
        { scopedGrant: false },
        ['themes/satin/src/pages/checkout-result.astro#/order-access'],
      ),
    );
  }
  if (!s.checkoutResultTerminalNotFound) {
    out.push(
      issue(
        c('flow', 'checkout-result', 'status-not-found'),
        'GAP',
        'terminal-not-found',
        'reported-as-pending',
        'a valid but absent order is reported as pending instead of terminal not-found',
        { absentOrderStatus: 'pending' },
        ['themes/satin/src/pages/checkout-result.astro#/status'],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// merchant-order-settings persistence invariants
// ---------------------------------------------------------------------------

/** the four visible order-setting categories and their capability tails. */
const ORDER_SETTING_CATEGORIES: ReadonlyArray<[string, string]> = [
  ['address', 'address-options'],
  ['contact', 'contact-options'],
  ['processing', 'processing-options'],
  ['customer-info', 'customer-info-options'],
];

function checkMerchantOrderSettings(
  facts: SatinStructuralFacts,
  out: TieredStructuralIssue[],
): void {
  const s = facts.source;
  for (const [key, tail] of ORDER_SETTING_CATEGORIES) {
    if (!s.orderSettingApplied[key]) {
      out.push(
        issue(
          c('flow', 'merchant-order-settings', `${key}.persistence`),
          'GAP',
          `${tail}-persist`,
          `${tail}-noop`,
          `visible ${key} order-settings options are no-op (not applied by the storefront form)`,
          { persists: false },
          [`themes/satin/src/pages/checkout.astro#/${key}`],
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Explicit open decisions (always NEEDS_DECISION, never a silent waiver)
// ---------------------------------------------------------------------------

/**
 * The two canonical open decisions carry a real observed conflict; the
 * remaining authoring/default/lifecycle decisions stay unresolved until Figma /
 * user / product review. Each maps to a contract `decisionCapabilityIds` entry.
 */
const DECISION_META: Readonly<
  Record<
    string,
    {
      expectedCode: string;
      observedCode: string;
      ref: string;
      facts: Record<string, unknown>;
    }
  >
> = {
  'satin.flow.publications.canonical-route': {
    expectedCode: 'canonical-publications-route',
    observedCode: 'route-conflict',
    ref: 'themes/satin/src/pages/blog/index.astro',
    facts: { candidates: ['/publication', '/publications', '/blog'] },
  },
  'satin.flow.merchant-order-settings.persisted-mapping': {
    expectedCode: 'canonical-key-value-mapping',
    observedCode: 'mapping-unresolved',
    ref: 'themes/satin/src/pages/checkout.astro#/persisted-mapping',
    facts: { unmergedKeysNormative: false },
  },
  'satin.decision.multirows.behavior': {
    expectedCode: 'reviewed-multirows-behavior',
    observedCode: 'multirows-behavior-open',
    ref: 'themes/satin/src/components/sections/MultiRows.astro',
    facts: { open: true },
  },
  'satin.decision.footer.groups-defaults': {
    expectedCode: 'reviewed-footer-groups-defaults',
    observedCode: 'footer-groups-defaults-open',
    ref: 'themes/satin/src/components/Footer.astro',
    facts: { open: true },
  },
  'satin.decision.imagewithtext.alignment': {
    expectedCode: 'reviewed-imagewithtext-alignment',
    observedCode: 'imagewithtext-alignment-open',
    ref: 'themes/satin/src/components/sections/ImageWithText.astro',
    facts: { open: true },
  },
  'satin.decision.collapsiblesection.sidebar-layout': {
    expectedCode: 'reviewed-collapsiblesection-sidebar-layout',
    observedCode: 'collapsiblesection-sidebar-layout-open',
    ref: 'themes/satin/src/components/sections/CollapsibleSection.astro',
    facts: { open: true },
  },
  'satin.decision.header.recursion-depth': {
    expectedCode: 'reviewed-header-recursion-depth',
    observedCode: 'header-recursion-depth-open',
    ref: 'themes/satin/src/components/Header.astro',
    facts: { open: true },
  },
  'satin.decision.logo.migration-cohorts': {
    expectedCode: 'reviewed-logo-migration-cohorts',
    observedCode: 'logo-migration-cohorts-open',
    ref: 'themes/satin/src/layouts/Layout.astro',
    facts: { open: true },
  },
  'satin.decision.version-domain.meaning': {
    expectedCode: 'reviewed-version-domain-meaning',
    observedCode: 'version-domain-meaning-open',
    ref: 'packages/theme-satin/theme.json',
    facts: { open: true },
  },
  'satin.decision.lifecycle.fresh-default-cohort': {
    expectedCode: 'reviewed-fresh-default-cohort',
    observedCode: 'fresh-default-cohort-open',
    ref: 'packages/theme-satin/theme.json#/pages',
    facts: { open: true },
  },
  'satin.decision.lifecycle.switch-reseed-preservation': {
    expectedCode: 'reviewed-switch-reseed-preservation',
    observedCode: 'switch-reseed-preservation-open',
    ref: 'packages/theme-satin/theme.json#/pages',
    facts: { open: true },
  },
};

function checkDecisions(
  contract: ThemeReleaseContract<'satin'>,
  out: TieredStructuralIssue[],
): void {
  for (const id of contract.decisionCapabilityIds) {
    const meta = DECISION_META[id];
    if (!meta) continue;
    out.push(
      issue(
        id,
        'NEEDS_DECISION',
        meta.expectedCode,
        meta.observedCode,
        `${id}: ${meta.observedCode}`,
        meta.facts,
        [meta.ref],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all Satin structural invariants. Returns deterministic, id-sorted
 * `TieredStructuralIssue`s derived from the observed facts + the contract; never
 * mutates its inputs and never emits an issue whose defect the fact set denies.
 */
export function runSatinStructuralChecks(
  facts: SatinStructuralFacts,
  contract: ThemeReleaseContract<'satin'>,
): TieredStructuralIssue[] {
  const out: TieredStructuralIssue[] = [];
  checkSections(facts, out);
  checkBlocks(facts, out);
  checkFeatures(facts, contract, out);
  checkCheckoutResultPage(facts, contract, out);
  checkAuth(facts, contract, out);
  checkCheckoutConfig(facts, out);
  checkSearch(facts, out);
  checkLegal(facts, out);
  checkPublications(facts, out);
  checkCartAndAccount(facts, out);
  checkCheckoutResultFlow(facts, out);
  checkMerchantOrderSettings(facts, out);
  checkDecisions(contract, out);
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
