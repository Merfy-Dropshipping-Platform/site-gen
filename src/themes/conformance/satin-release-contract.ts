/**
 * `SATIN_RELEASE_CONTRACT` — the confirmed Satin release contract (Task 3).
 *
 * It contains ONLY approved Satin requirements and explicit open decisions. It
 * carries NO Bloom policy: no Bloom Benefits, no Bloom Publications
 * implementation facts, no Bloom radius findings and no Bloom storage/event
 * names appear here. Every requirement is a Satin surface the user requires
 * open/working; every unresolved item is an EXPLICIT decision that emits
 * `NEEDS_DECISION`, never a silent waiver.
 *
 * This module is a pure data module (it imports the platform page registry, the
 * Satin section map keys and the stable capability-id builder), performs no I/O,
 * and is input ONLY to Satin's theme digest.
 *
 * `externalAudits` MUST be deep-equal to `SATIN_SOURCE_ADAPTER.externalAudits`
 * so the harness never reports two competing provenance sets. It is
 * evidence-only cross-service review metadata; site-gen CI never reads those
 * repositories.
 */

import { PAGE_REGISTRY } from '../page-registry';
import { makeCapabilityId } from '../../../packages/theme-contract/conformance';
import type { ExternalAuditRef } from './source-types';
import type {
  ThemeReleaseContract,
  ReleasePageRequirement,
  ReleaseFlowRequirement,
} from './release-contracts';
import { SATIN_EXTERNAL_AUDITS } from './satin-source-adapter';

const SATIN = 'satin';
const c = (...seg: [string, ...string[]]) => makeCapabilityId(SATIN, ...seg);

// ---------------------------------------------------------------------------
// Pages — every platform page relevant to Satin, including page-checkout-result.
// ---------------------------------------------------------------------------

/**
 * The dedicated standalone content/source file each page requires. A page not
 * named here is a composed content page with no standalone Astro source
 * (`contentFile: null`). `checkout-result` is required as a composed content
 * page: it has NO dedicated standalone Astro source yet (that is the landed GAP),
 * but manifest + seed + composed live output remain mandatory.
 */
const SATIN_CONTENT_FILES: Readonly<Record<string, string | null>> = {
  'page-cart': 'themes/satin/src/pages/cart.astro',
  'page-product': 'themes/satin/src/pages/product.astro',
  'page-checkout': 'themes/satin/src/pages/checkout.astro',
  'page-catalog': 'themes/satin/src/pages/catalog.astro',
};

/**
 * Routes whose registry/composer explicitly permits a home-shell fallback (no
 * dedicated standalone Astro page is required). `checkout-result` is the sole
 * Satin content route that relies on the composed shell — a fact recorded
 * SEPARATELY from `contentFile` so the invariant (manifest + seed + composed
 * live output mandatory) does not depend on a standalone Astro page existing.
 */
const SATIN_SHELL_FALLBACK_ROUTES = new Set<string>(['checkout-result']);

const SATIN_PAGES: readonly ReleasePageRequirement[] = PAGE_REGISTRY.map(
  (e): ReleasePageRequirement => ({
    id: e.id,
    route: e.route,
    contentFile: SATIN_CONTENT_FILES[e.id] ?? null,
    shellFallbackAllowed: SATIN_SHELL_FALLBACK_ROUTES.has(e.route),
  }),
);

// ---------------------------------------------------------------------------
// Renderer names — the 18 mapped sections + the explicit Catalog declaration.
// ---------------------------------------------------------------------------

/**
 * The 18 mapped section keys from `themes/satin/sections.map.json`, plus
 * `Catalog`. Catalog is an EXPLICIT manifest-declaration requirement per the
 * approved Satin design even though it currently ships as a physical/registry
 * package block absent from `theme.json.blocks`; a cross-theme implicit
 * convention does not overrule the approved Satin contract.
 */
const SATIN_MAPPED_SECTIONS: readonly string[] = [
  'PromoBanner',
  'Header',
  'Hero',
  'Collections',
  'PopularProducts',
  'Gallery',
  'Footer',
  'ContactForm',
  'MainText',
  'ImageWithText',
  'MultiColumns',
  'MultiRows',
  'CollapsibleSection',
  'Newsletter',
  'Slideshow',
  'Publications',
  'Video',
  'CartSection',
];

const SATIN_REQUIRED_RENDERERS: readonly string[] = [
  ...SATIN_MAPPED_SECTIONS,
  'Catalog',
];

// ---------------------------------------------------------------------------
// Required runtime sources — the subset the Task-2 source adapter names.
// (kept in sync with SATIN_SOURCE_ADAPTER.requiredRuntimeSources by review.)
// ---------------------------------------------------------------------------

const SATIN_REQUIRED_RUNTIME_SOURCES: readonly string[] = [
  'themes/satin/src/layouts/Layout.astro',
  'themes/satin/src/lib/auth.ts',
  'themes/satin/src/lib/cart.ts',
  'themes/satin/src/lib/cart-thumb-html.ts',
  'themes/satin/src/lib/nt-cart-satin.ts',
  'themes/satin/src/lib/storefront-hydrate.ts',
  'themes/satin/src/lib/wishlist.ts',
];

// ---------------------------------------------------------------------------
// Required flows — the confirmed Satin structural units.
//
// Every flow currently reports the STRUCTURAL tier (this baseline); its
// authoring/effect/browser behavior stays UNKNOWN in the inventory/report until
// a later plan's runner executes it. The capability IDs are built through
// `makeCapabilityId` (never raw concatenation) so an arbitrary route/key never
// produces an unstable or path-like id.
// ---------------------------------------------------------------------------

const STRUCTURAL = ['structural'] as const;

function flow(
  capabilityId: string,
  sourceRefs: readonly string[],
): ReleaseFlowRequirement {
  return { capabilityId, requiredTiers: STRUCTURAL, sourceRefs };
}

const SATIN_FLOWS: readonly ReleaseFlowRequirement[] = [
  // checkout-result page + flow
  flow(c('page', 'page-checkout-result', 'manifest'), [
    'packages/theme-satin/theme.json#/pages',
  ]),
  flow(c('page', 'page-checkout-result', 'seed'), [
    'packages/theme-satin/theme.json#/pages',
  ]),
  flow(c('page', 'page-checkout-result', 'live-output'), [
    'src/generator/build.service.ts#/composeContentPagesIntoDist',
  ]),
  flow(c('flow', 'checkout-result', 'redirect-target'), [
    'themes/satin/src/pages/checkout.astro#/success-redirect',
  ]),
  flow(c('flow', 'checkout-result', 'status-endpoint'), [
    'themes/satin/src/pages/checkout-result.astro#/status',
  ]),
  flow(c('flow', 'checkout-result', 'summary-endpoint'), [
    'themes/satin/src/pages/checkout-result.astro#/summary',
  ]),
  flow(c('flow', 'checkout-result', 'status-not-found'), [
    'themes/satin/src/pages/checkout-result.astro#/status',
  ]),
  flow(c('flow', 'checkout-result', 'confirmation-grant'), [
    'themes/satin/src/pages/checkout-result.astro#/order-access',
  ]),

  // auth
  flow(c('flow', 'auth', 'demo-routes'), ['themes/satin/src/pages/login.astro']),
  flow(c('flow', 'auth', 'canonical-links'), ['themes/satin/src/lib/auth.ts']),
  flow(c('flow', 'auth', 'return-parameter'), [
    'themes/satin/src/pages/login.astro#/return',
  ]),
  flow(c('flow', 'auth', 'login-return-propagation'), [
    'themes/satin/src/pages/login.astro#/navTo',
  ]),
  flow(c('flow', 'auth', 'verify-return-propagation'), [
    'themes/satin/src/pages/verify.astro#/return',
  ]),

  // search
  flow(c('flow', 'search', 'form-action'), [
    'themes/satin/src/scripts/gsap/search.ts',
  ]),
  flow(c('flow', 'search', 'suggestions-data-source'), [
    'themes/satin/src/scripts/gsap/search.ts#/suggestions',
  ]),
  flow(c('flow', 'search', 'catalog-read-q'), [
    'themes/satin/src/pages/catalog.astro#/q',
  ]),
  flow(c('flow', 'search', 'catalog-forward-q'), [
    'themes/satin/src/pages/catalog.astro#/q',
  ]),

  // legal
  flow(c('flow', 'legal', 'generator-prefix'), [
    'themes/satin/src/pages/legal/[slug].astro',
  ]),
  flow(c('flow', 'legal', 'footer-refund'), [
    'themes/satin/src/components/Footer.astro#/refund',
  ]),
  flow(c('flow', 'legal', 'footer-privacy'), [
    'themes/satin/src/components/Footer.astro#/privacy',
  ]),
  flow(c('flow', 'legal', 'footer-tos'), [
    'themes/satin/src/components/Footer.astro#/terms',
  ]),
  flow(c('flow', 'legal', 'footer-shipping'), [
    'themes/satin/src/components/Footer.astro#/shipping-policy',
  ]),
  flow(c('flow', 'legal', 'checkout-cookies'), [
    'themes/satin/src/pages/checkout.astro#/cookies',
  ]),
  flow(c('flow', 'legal', 'static-demo-exclusion'), [
    'themes/satin/src/pages/legal/[slug].astro',
  ]),

  // publications
  flow(c('flow', 'publications', 'list-route'), [
    'themes/satin/src/pages/blog/index.astro',
  ]),
  flow(c('flow', 'publications', 'detail-route'), [
    'themes/satin/src/pages/blog/[...slug].astro',
  ]),
  flow(c('flow', 'publications', 'merchant-data'), [
    'themes/satin/src/pages/blog/index.astro#/data-source',
  ]),
  flow(c('flow', 'publications', 'rss-data-source'), [
    'themes/satin/src/pages/blog/index.astro#/rss',
  ]),
  flow(c('flow', 'publications', 'live-demo-exclusion'), [
    'themes/satin/src/pages/blog/index.astro',
  ]),
  flow(c('flow', 'publications', 'rich-text-sanitizer'), [
    'themes/satin/src/pages/blog/[...slug].astro#/sanitizer',
  ]),

  // cart / cart-drawer
  flow(c('flow', 'cart', 'cart-section-target'), [
    'themes/satin/src/components/sections/CartSection.astro',
  ]),
  flow(c('flow', 'cart', 'drawer-cart-section-source'), [
    'themes/satin/src/scripts/gsap/cart-drawer.ts#/source',
  ]),
  flow(c('flow', 'cart', 'disclaimer-coupling'), [
    'themes/satin/src/components/sections/CartSection.astro#/disclaimer',
  ]),
  flow(c('flow', 'cart', 'preview-empty-array'), [
    'themes/satin/src/components/sections/CartSection.astro#/preview',
  ]),
  flow(c('flow', 'cart', 'preview-product-context'), [
    'themes/satin/src/components/sections/CartSection.astro#/preview',
  ]),
  flow(c('flow', 'cart', 'safe-dom'), [
    'themes/satin/src/lib/cart.ts#/sink',
  ]),

  // account
  flow(c('flow', 'account', 'route-index'), [
    'themes/satin/src/pages/account/index.astro',
  ]),
  flow(c('flow', 'account', 'route-profile'), [
    'themes/satin/src/pages/account/profile.astro',
  ]),
  flow(c('flow', 'account', 'route-orders'), [
    'themes/satin/src/pages/account/orders.astro',
  ]),
  flow(c('flow', 'account', 'route-order-detail'), [
    'themes/satin/src/pages/account/order.astro',
  ]),
  flow(c('flow', 'account', 'orders-safe-dom'), [
    'themes/satin/src/pages/account/orders.astro#/sink',
  ]),
  flow(c('flow', 'account', 'order-detail-safe-dom'), [
    'themes/satin/src/pages/account/order.astro#/sink',
  ]),

  // checkout-config
  flow(c('flow', 'checkout-config', 'require-auth-preview'), [
    'src/controllers/preview.controller.ts#/checkout-auth',
  ]),
  flow(c('flow', 'checkout-config', 'require-auth-live'), [
    'src/generator/build.service.ts#/checkout-auth',
  ]),
  flow(c('flow', 'checkout-config', 'scheme-initial-injection'), [
    'src/generator/build.service.ts#/checkout-scheme',
  ]),

  // merchant order settings
  flow(c('flow', 'merchant-order-settings', 'address.persistence'), [
    'themes/satin/src/pages/checkout.astro#/address',
  ]),
  flow(c('flow', 'merchant-order-settings', 'contact.persistence'), [
    'themes/satin/src/pages/checkout.astro#/contact',
  ]),
  flow(c('flow', 'merchant-order-settings', 'processing.persistence'), [
    'themes/satin/src/pages/checkout.astro#/processing',
  ]),
  flow(c('flow', 'merchant-order-settings', 'customer-info.persistence'), [
    'themes/satin/src/pages/checkout.astro#/customer-info',
  ]),

  // page-generation feature
  flow(c('flow', 'page-generation', 'puck-driven-pages'), [
    'packages/theme-satin/theme.json#/features',
  ]),

  // wishlist feature (user requires it OPEN → expected true)
  flow(c('flow', 'wishlist', 'feature'), [
    'themes/satin/src/pages/wishlist.astro',
    'packages/theme-satin/theme.json#/features/wishlist',
  ]),
];

// ---------------------------------------------------------------------------
// Explicit open decisions — each emits NEEDS_DECISION, never a silent waiver.
// These stay unresolved until Figma/user/product review.
// ---------------------------------------------------------------------------

const SATIN_DECISION_CAPABILITY_IDS: readonly string[] = [
  // canonical Publications route (/publication vs /publications vs /blog)
  c('flow', 'publications', 'canonical-route'),
  // merchant order-settings persisted key/value mapping
  c('flow', 'merchant-order-settings', 'persisted-mapping'),
  // authoring/default/lifecycle decisions named in the plan
  c('decision', 'multirows', 'behavior'),
  c('decision', 'footer', 'groups-defaults'),
  c('decision', 'imagewithtext', 'alignment'),
  c('decision', 'collapsiblesection', 'sidebar-layout'),
  c('decision', 'header', 'recursion-depth'),
  c('decision', 'logo', 'migration-cohorts'),
  c('decision', 'version-domain', 'meaning'),
  c('decision', 'lifecycle', 'fresh-default-cohort'),
  c('decision', 'lifecycle', 'switch-reseed-preservation'),
];

// ---------------------------------------------------------------------------
// Feature flags Satin must declare AND enable. wishlist is `true` because the
// user requires ALL surfaces open and Satin already exposes route/links/PDP/
// runtime; the current `wishlist:false` in theme.json is therefore a GAP, not a
// contract change.
// ---------------------------------------------------------------------------

const SATIN_REQUIRED_FEATURES: Readonly<Record<string, boolean>> = {
  newsletter: true,
  'cart-drawer': true,
  'otp-auth': true,
  wishlist: true,
  'color-swatches': true,
  'filter-sidebar': true,
  puckDrivenPages: true,
};

// ---------------------------------------------------------------------------
// External audits — deep-equal to SATIN_SOURCE_ADAPTER.externalAudits.
// ---------------------------------------------------------------------------

const SATIN_RELEASE_EXTERNAL_AUDITS: readonly ExternalAuditRef[] =
  SATIN_EXTERNAL_AUDITS;

export const SATIN_RELEASE_CONTRACT: ThemeReleaseContract<'satin'> = {
  theme: SATIN,
  pages: SATIN_PAGES,
  requiredFeatures: SATIN_REQUIRED_FEATURES,
  requiredRuntimeSources: SATIN_REQUIRED_RUNTIME_SOURCES,
  requiredRendererNames: SATIN_REQUIRED_RENDERERS,
  requiredFlows: SATIN_FLOWS,
  decisionCapabilityIds: SATIN_DECISION_CAPABILITY_IDS,
  externalAudits: SATIN_RELEASE_EXTERNAL_AUDITS,
};
