/**
 * Satin structural FACT LOADER — reads the REAL Satin source + compiled
 * artifacts and produces the deterministic {@link SatinStructuralFacts} the
 * checker consumes.
 *
 * Every field is grounded on a concrete on-disk observation:
 *  - manifest/block/page/feature facts come from the generic source snapshot
 *    (`themeJson`, `resolutions`, `registry`, `hasCheckoutResultPage`);
 *  - the two renderer facts come from the compiled mapped-renderer child-process
 *    probes (`render-satin-slideshow.mjs`, `render-satin-multicolumns.mjs`) —
 *    they are captured ONCE here and stored on the fact object, so the checker
 *    reads a fact, it never re-renders;
 *  - the flow facts are deterministic structural probes over the REAL theme
 *    source bytes (the same bytes the digest hashes). Each probe is a narrow,
 *    documented read of one source file; a probe never greps a generated
 *    fragment and never infers support from a comment.
 *
 * Determinism: no wall-clock, no absolute path leaks into the fact object; a
 * missing source file yields the SAFEST fact for its finding (present-defect),
 * never a crash — a genuinely missing required source is already reported by the
 * snapshot's `requiredRuntimeSources`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import type { ThemeSourceSnapshot } from './source-types';
import type {
  SatinStructuralFacts,
  SatinRendererFacts,
  SatinSourceFacts,
} from './satin-structural-checks';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Small deterministic file helpers
// ---------------------------------------------------------------------------

/** Read a repo-relative source file, or `null` when it does not exist. */
function readSource(rel: string): string | null {
  const abs = resolve(SITES_ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

/** True when the file exists AND matches the pattern. */
function fileMatches(rel: string, re: RegExp): boolean {
  const code = readSource(rel);
  return code !== null && re.test(code);
}

// ---------------------------------------------------------------------------
// Renderer facts (compiled mapped-renderer child-process probes)
// ---------------------------------------------------------------------------

/**
 * The render-probe interface. The default implementation spawns the two Task-3
 * `.mjs` probes; tests inject a deterministic fake so the checker stays hermetic.
 */
export interface SatinRenderProbes {
  slideshow: () => {
    conflictingImage: string[];
    conflictingHrefs: string[];
    /**
     * The 2D layout signature (`justify|items`) the renderer emits for each
     * canonical position, in order. The Slideshow canvas is a flex-ROW: the
     * VERTICAL axis is `justify-*` (POSITION_JUSTIFY) and the HORIZONTAL axis is
     * `items-*` (POSITION_ITEMS). A position's real domain is the FULL 2D pair,
     * NOT the horizontal `justify-*` alone.
     */
    canonicalPosition2d: string[];
    /** distinct 2D layout signatures the renderer exposes across positions. */
    distinctBehaviors2d: string[];
    canonicalPositionCount: number;
  };
  multicolumns: () => {
    /** the compiled schema STRIPS the `containerEnabled` toggle (field↔schema drift). */
    containerEnabledStripped: boolean;
    /** the renderer reads canonical `title` BEFORE legacy `heading`. */
    canonicalTitleFirst: boolean;
    /** the renderer reads canonical `description` BEFORE legacy `text`. */
    canonicalDescriptionFirst: boolean;
    /** the renderer reads canonical `image` BEFORE legacy `imageUrl`. */
    canonicalImageFirst: boolean;
  };
}

const SLIDESHOW_PROBE = resolve(
  SITES_ROOT,
  'src/themes/__tests__/render-satin-slideshow.mjs',
);
const MULTICOLUMNS_PROBE = resolve(
  SITES_ROOT,
  'src/themes/__tests__/render-satin-multicolumns.mjs',
);
const MULTICOLUMNS_RENDER_PROBE = resolve(
  SITES_ROOT,
  'src/themes/__tests__/render-satin-multicolumns-section.mjs',
);

const CANONICAL_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
const LEGACY_POSITIONS = ['left', 'right'] as const;

const uniqueImages = (html: string): string[] => [
  ...new Set(html.match(/\/(canonical|legacy|c)\.png/g) ?? []),
];
const uniqueHrefs = (html: string): string[] =>
  [...new Set(html.match(/href="([^"]*)"/g) ?? [])].map((h) =>
    h.replace(/^href="/, '').replace(/"$/, ''),
  );

/**
 * Extract the DISTINCT 2D position signatures (`justify|items`) the Slideshow
 * canvas emits. The position-bearing element is the slide row (`satin-pad`/`px-4`
 * padding marker) that carries BOTH a `justify-*` (vertical axis on flex-row) and
 * an `items-*` (horizontal axis) class. We read only that element so unrelated
 * `items-center` decorations (CTA button, pagination) never pollute the axis.
 */
const position2d = (html: string): string[] => {
  const combos = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const cls = m[1];
    if (!/\b(satin-pad|px-4)\b/.test(cls)) continue;
    const j = cls.match(/\bjustify-(start|end|center)\b/);
    const i = cls.match(/\bitems-(start|end|center)\b/);
    if (j && i) combos.add(`${j[1]}|${i[1]}`);
  }
  return [...combos];
};

/** The real render probes: spawn the compiled mapped-renderer child processes. */
export const REAL_RENDER_PROBES: SatinRenderProbes = {
  slideshow: () => {
    // conflicting: both legacy + canonical present (image + CTA).
    const conflicting = {
      slides: [
        {
          imageUrl: '/legacy.png',
          image: '/canonical.png',
          heading: 'C',
          ctaText: 'Go',
          ctaUrl: '/legacy-cta',
          button: { link: { href: '/canonical-cta' } },
          position: 'right',
        },
      ],
    };
    // one slide per canonical + legacy position.
    const positionFixtures = [...CANONICAL_POSITIONS, ...LEGACY_POSITIONS].map(
      (pos) => ({
        slides: [
          { image: '/c.png', heading: 'H', ctaText: 'Go', ctaUrl: '/x', position: pos },
        ],
      }),
    );
    const propsList = [conflicting, ...positionFixtures];
    const stdout = execFileSync('node', [SLIDESHOW_PROBE, JSON.stringify(propsList)], {
      encoding: 'utf-8',
      cwd: SITES_ROOT,
    });
    const htmls = JSON.parse(stdout) as string[];
    const conflictingHtml = htmls[0];
    const canonicalHtmls = htmls.slice(1, 1 + CANONICAL_POSITIONS.length);
    const legacyHtmls = htmls.slice(1 + CANONICAL_POSITIONS.length);

    // Each canonical position yields exactly one 2D signature; collect them in
    // order so the caller can count the distinct 2D domain the renderer covers.
    const canonicalPosition2d = canonicalHtmls.flatMap((h) => position2d(h));
    const distinctBehaviors2d = [
      ...new Set(
        [...canonicalHtmls, ...legacyHtmls].flatMap((h) => position2d(h)),
      ),
    ].sort();
    return {
      conflictingImage: uniqueImages(conflictingHtml),
      conflictingHrefs: uniqueHrefs(conflictingHtml),
      canonicalPosition2d,
      distinctBehaviors2d,
      canonicalPositionCount: CANONICAL_POSITIONS.length,
    };
  },
  multicolumns: () => {
    // (1) Schema-agreement probe: does the compiled schema keep the
    //     `containerEnabled` toggle key (field↔schema drift resolved)?
    const schemaInput = {
      heading: 'H',
      columns: [{ id: 'a', title: 'T' }],
      containerEnabled: 'true',
      displayColumns: 3,
      padding: { top: 0, bottom: 0 },
    };
    const schemaStdout = execFileSync(
      'node',
      [MULTICOLUMNS_PROBE, JSON.stringify(schemaInput)],
      { encoding: 'utf-8', cwd: SITES_ROOT },
    );
    const schemaObs = JSON.parse(schemaStdout) as {
      topContainerEnabledStripped: boolean;
    };

    // (2) Renderer canonical-first probe: with conflicting canonical + legacy
    //     leaves, the rendered HTML must carry the CANONICAL value (title /
    //     description / image) and NOT the legacy alias (heading / text /
    //     imageUrl). The renderer resolves the stored-shape ambiguity.
    const renderInput = {
      heading: 'H',
      columns: [
        {
          id: 'a',
          heading: 'LEGACY_HEADING',
          title: 'CANON_TITLE',
          imageUrl: '/legacy.png',
          image: '/canonical.png',
          text: 'LEGACY_TEXT',
          description: 'CANON_DESC',
        },
      ],
      displayColumns: 1,
      containerEnabled: 'true',
      padding: { top: 0, bottom: 0 },
    };
    const renderStdout = execFileSync(
      'node',
      [MULTICOLUMNS_RENDER_PROBE, JSON.stringify(renderInput)],
      { encoding: 'utf-8', cwd: SITES_ROOT },
    );
    const renderObs = JSON.parse(renderStdout) as {
      hasCanonTitle: boolean;
      hasLegacyHeading: boolean;
      hasCanonDesc: boolean;
      hasLegacyText: boolean;
      hasCanonImage: boolean;
      hasLegacyImage: boolean;
    };

    return {
      containerEnabledStripped: schemaObs.topContainerEnabledStripped,
      canonicalTitleFirst:
        renderObs.hasCanonTitle && !renderObs.hasLegacyHeading,
      canonicalDescriptionFirst:
        renderObs.hasCanonDesc && !renderObs.hasLegacyText,
      canonicalImageFirst:
        renderObs.hasCanonImage && !renderObs.hasLegacyImage,
    };
  },
};

function toRendererFacts(probes: SatinRenderProbes): SatinRendererFacts {
  const ss = probes.slideshow();
  const mc = probes.multicolumns();

  // alias precedence: conflicting props → legacy wins iff the legacy value is
  // present in the render and the canonical one is NOT.
  const slideshowLegacyImageWins =
    ss.conflictingImage.includes('/legacy.png') &&
    !ss.conflictingImage.includes('/canonical.png');
  const slideshowLegacyCtaWins =
    ss.conflictingHrefs.includes('/legacy-cta') &&
    !ss.conflictingHrefs.includes('/canonical-cta');

  // position domain (2D): the Slideshow canvas is a flex-ROW, so a position's
  // real layout is a `justify|items` PAIR (vertical × horizontal), not the
  // `justify-*` horizontal axis alone. Count the DISTINCT 2D signatures the nine
  // canonical positions produce — the renderer's real position domain.
  const rendererPositionCount = new Set(ss.canonicalPosition2d).size;

  // stored-shape resolution: the finding is remediated iff BOTH dimensions of
  // the original defect are gone —
  //   (a) the schema no longer STRIPS `containerEnabled` (field↔schema agree), and
  //   (b) the renderer reads canonical-first for every aliased leaf so the
  //       stored ambiguity is resolved deterministically (renderer agrees).
  const multiColumnsSchemaStripsContainerEnabled = mc.containerEnabledStripped;
  const multiColumnsRendererCanonicalFirst =
    mc.canonicalTitleFirst &&
    mc.canonicalDescriptionFirst &&
    mc.canonicalImageFirst;

  return {
    slideshowLegacyImageWins,
    slideshowLegacyCtaWins,
    // The renderer distinguishes FEWER positions than the sidebar exposes only
    // when the nine canonical positions collapse to fewer than nine distinct 2D
    // layouts. After the 9-cell justify×items fix each position is unique → the
    // renderer domain equals the sidebar domain (9) and the GAP is resolved.
    slideshowRendererPositionCount: rendererPositionCount,
    slideshowSidebarPositionCount: ss.canonicalPositionCount,
    multiColumnsSchemaStripsContainerEnabled,
    multiColumnsRendererCanonicalFirst,
  };
}

// ---------------------------------------------------------------------------
// Source facts (deterministic probes over the real theme bytes)
// ---------------------------------------------------------------------------

function loadSourceFacts(): SatinSourceFacts {
  // --- auth ---------------------------------------------------------------
  // demo routes: /auth/* demo pages coexist with the working /login route.
  const authDemoRoutesCoexist =
    existsSync(resolve(SITES_ROOT, 'themes/satin/src/pages/auth/sign-in.astro')) &&
    existsSync(resolve(SITES_ROOT, 'themes/satin/src/pages/login.astro'));

  // return-parameter divergence: the CANONICAL checkout-return convention is
  // `next` (the approved contract). Collect the return-param keys the Satin auth
  // surfaces ACTUALLY read; when the observed key set differs from the canonical
  // `next`, the two conventions diverge. Satin's login/account guards read
  // `redirect` (and emit `/login?redirect=…`), so the observed key is `redirect`
  // — divergent from the canonical `next`.
  const CANONICAL_RETURN_PARAM = 'next';
  const observedReturnParams = new Set<string>();
  const authSources = [
    'themes/satin/src/pages/login.astro',
    'themes/satin/src/pages/account/order.astro',
    'themes/satin/src/pages/account/orders.astro',
    'themes/satin/src/pages/account/profile.astro',
    'themes/satin/src/lib/auth.ts',
  ];
  for (const rel of authSources) {
    const code = readSource(rel) ?? '';
    if (/params?\.get\(\s*['"]redirect['"]\s*\)|[?&]redirect=/.test(code)) {
      observedReturnParams.add('redirect');
    }
    if (/params?\.get\(\s*['"]next['"]\s*\)|[?&]next=/.test(code)) {
      observedReturnParams.add('next');
    }
  }
  // The canonical + every observed key. When the observed set is not exactly the
  // canonical singleton, the conventions diverge (>1 distinct key).
  const authReturnParams = [
    ...new Set([CANONICAL_RETURN_PARAM, ...observedReturnParams]),
  ].sort();

  // login-return-propagation: fallback target `/account` on a successful login.
  const authLoginFallbackTarget = fileMatches(
    'themes/satin/src/pages/login.astro',
    /params?\.get\(\s*['"]redirect['"]\s*\)\s*\|\|\s*['"]\/account['"]/,
  )
    ? '/account'
    : 'preserved';

  // verify-return-propagation: verify navigates to /account on success and does
  // NOT read a canonical return param → return NOT preserved.
  const verifyCode = readSource('themes/satin/src/pages/verify.astro') ?? '';
  const verifyPreservesReturn =
    /navTo\(\s*[^)]*redirect[^)]*\)/.test(verifyCode) ||
    /navTo\(\s*[^)]*next[^)]*\)/.test(verifyCode);

  // --- search -------------------------------------------------------------
  // suggestions from demo: the search index is built from the local demo
  // `catalogProducts` module (Header imports ../data/products and injects the
  // data-search-index the search script reads).
  const headerCode = readSource('themes/satin/src/components/Header.astro') ?? '';
  const searchSuggestionsFromDemo =
    /from\s+['"][^'"]*data\/products['"]/.test(headerCode) &&
    /data-search-index/.test(headerCode);
  // catalog-read-q: catalog.astro does NOT read a `q` query key.
  const catalogCode = readSource('themes/satin/src/pages/catalog.astro') ?? '';
  const catalogReadsSubmittedQ =
    /searchParams\.get\(\s*['"]q['"]\s*\)/.test(catalogCode);

  // --- legal --------------------------------------------------------------
  // footer legal targets: the footer's default information-column fallback is
  // EMPTY (coerceColumnLinks(p.informationColumn, [])) → no canonical /legal/*
  // target is wired by default. A target is "present" only when the footer maps
  // the canonical href literally.
  const footerCode = readSource('themes/satin/src/components/Footer.astro') ?? '';
  const footerLegalTargets: Record<string, boolean> = {
    refund: /\/legal\/refund/.test(footerCode),
    privacy: /\/legal\/privacy/.test(footerCode),
    tos: /\/legal\/terms/.test(footerCode),
    shipping: /\/legal\/shipping-policy/.test(footerCode),
  };
  // checkout-cookies: no generated cookies policy route.
  const checkoutCode = readSource('themes/satin/src/pages/checkout.astro') ?? '';
  const checkoutCookiesHasGeneratedRoute = /\/legal\/cookies|cookies-policy/.test(
    checkoutCode,
  );

  // --- publications -------------------------------------------------------
  // merchant-data / detail-route: the blog list reads a static Astro content
  // collection (getCollection('blog')) → demo/static, not merchant data.
  const blogIndexCode =
    readSource('themes/satin/src/pages/blog/index.astro') ?? '';
  const publicationsFallsBackToDemo = /getCollection\(\s*['"]blog['"]\s*\)/.test(
    blogIndexCode,
  );
  const blogDetailCode =
    readSource('themes/satin/src/pages/blog/[...slug].astro') ?? '';
  // A working merchant detail route resolves only when the detail page reads a
  // merchant data source; the static getStaticPaths + getCollection detail is a
  // demo route → does not resolve merchant cards.
  const publicationsDetailRouteResolves =
    blogDetailCode.length > 0 &&
    !/getCollection\(\s*['"]blog['"]\s*\)/.test(blogDetailCode) &&
    /getEntry|merchant|fetch\(/.test(blogDetailCode);

  // --- cart ---------------------------------------------------------------
  // drawer-cart-section-source: the resolver (cart-drawer-contract.ts) inspects
  // legacy CartBody/CartSummary block types.
  const resolverCode =
    readSource('src/themes/cart-drawer-contract.ts') ?? '';
  const cartResolverInspectsLegacyTypes: string[] = [];
  if (/findScheme\(\s*['"]CartBody['"]\s*\)/.test(resolverCode))
    cartResolverInspectsLegacyTypes.push('CartBody');
  if (/CartSummary/.test(resolverCode))
    cartResolverInspectsLegacyTypes.push('CartSummary');
  const cartMigratedTarget = 'CartSection';

  // cart safe-dom: the cart line render interpolates line.name into innerHTML
  // WITHOUT an allowlisted sanitizer/text adapter dominating it.
  const ntCartCode = readSource('themes/satin/src/lib/nt-cart-satin.ts') ?? '';
  const cartSinkSanitized =
    /innerHTML/.test(ntCartCode) &&
    /(sanitize|escapeHtml|textContent\s*=\s*[^;]*name)/.test(ntCartCode);

  // --- account safe-dom ---------------------------------------------------
  const ordersCode =
    readSource('themes/satin/src/pages/account/orders.astro') ?? '';
  const accountOrdersSinkSanitized =
    /\.innerHTML\s*=/.test(ordersCode) &&
    /(sanitize|escapeHtml)/.test(ordersCode);
  const orderDetailCode =
    readSource('themes/satin/src/pages/account/order.astro') ?? '';
  const accountOrderDetailSinkSanitized =
    /\.innerHTML\s*=/.test(orderDetailCode) &&
    /(sanitize|escapeHtml)/.test(orderDetailCode);

  // --- checkout-config ----------------------------------------------------
  // The preview controller injects requireCustomerAuth INTO the checkout runtime
  // config (`CheckoutRuntimeConfig.requireCustomerAuth`) that the form consumes.
  const previewCode = readSource('src/controllers/preview.controller.ts') ?? '';
  const checkoutConfigAuthInPreview = /requireCustomerAuth/.test(previewCode);
  // live: the LIVE checkout runtime config is built by checkout.astro's client
  // `apply()` (which writes `cfg.checkout = {...}`). That apply() maps ONLY
  // contactMethod/customerNameMode/addressRequired — it OMITS requireCustomerAuth
  // — so the runtime checkout config the form sees on live loses the auth flag.
  // (build.service passes requireCustomerAuth into siteData.meta, a DIFFERENT
  // location the apply() never merges into cfg.checkout.)
  const checkoutConfigAuthInLive = /cfg\.checkout\s*=[\s\S]*requireCustomerAuth/.test(
    checkoutCode,
  );
  // scheme-initial-injection: preview injects cfg.checkout server-side (the
  // "Превью уже проставило cfg.checkout сервер-сайд" branch) while live composes
  // its own; the two are not proven identical → context diverges.
  const checkoutConfigSchemeConsistent = false;

  // --- merchant order settings -------------------------------------------
  // A category is applied only when a storefront form component READS
  // cfg.checkout.<key>. No component consumes cfg.checkout → all no-op.
  const consumerCode = [
    'themes/satin/src/components/sections/CheckoutSection.astro',
    'themes/satin/src/components/CheckoutForm.astro',
    'themes/satin/src/lib/storefront-hydrate.ts',
  ]
    .map((rel) => readSource(rel) ?? '')
    .join('\n');
  const appliesConfig = (keys: RegExp): boolean =>
    /cfg\.checkout|__MERFY_CONFIG__[^\n]*checkout/.test(consumerCode) &&
    keys.test(consumerCode);
  const orderSettingApplied: Record<string, boolean> = {
    address: appliesConfig(/addressRequired/),
    contact: appliesConfig(/contactMethod/),
    processing: appliesConfig(/processing/),
    'customer-info': appliesConfig(/customerNameMode/),
  };

  // --- checkout-result ----------------------------------------------------
  // The checkout-result page does not exist yet → scoped-grant absent AND a
  // valid-but-absent order cannot report a terminal not-found.
  const checkoutResultCode =
    readSource('themes/satin/src/pages/checkout-result.astro') ?? '';
  const checkoutResultScopedGrant =
    /confirmationGrant|scoped-grant|grantToken/.test(checkoutResultCode);
  const checkoutResultTerminalNotFound =
    /not-found|notFound|terminal/.test(checkoutResultCode) &&
    !/status\s*=\s*['"]pending['"]/.test(checkoutResultCode);

  return {
    authDemoRoutesCoexist,
    authReturnParams,
    authLoginFallbackTarget,
    authVerifyPreservesReturn: verifyPreservesReturn,
    searchSuggestionsFromDemo,
    catalogReadsSubmittedQ,
    footerLegalTargets,
    checkoutCookiesHasGeneratedRoute,
    publicationsFallsBackToDemo,
    publicationsDetailRouteResolves,
    cartResolverInspectsLegacyTypes,
    cartMigratedTarget,
    cartSinkSanitized,
    accountOrdersSinkSanitized,
    accountOrderDetailSinkSanitized,
    checkoutConfigAuthInPreview,
    checkoutConfigAuthInLive,
    checkoutConfigSchemeConsistent,
    orderSettingApplied,
    checkoutResultScopedGrant,
    checkoutResultTerminalNotFound,
  };
}

// ---------------------------------------------------------------------------
// Public assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the complete Satin fact object from the REAL source snapshot + real
 * source/renderer probes. `renderProbes` defaults to the compiled child-process
 * probes; tests inject a deterministic fake.
 */
export function buildSatinStructuralFacts(
  snapshot: ThemeSourceSnapshot,
  renderProbes: SatinRenderProbes = REAL_RENDER_PROBES,
): SatinStructuralFacts {
  const themeJson = snapshot.themeJson as {
    features?: Record<string, boolean>;
    blocks?: Record<string, unknown>;
    pages?: Array<{ id?: string }>;
  };
  const features = themeJson.features ?? {};
  const manifestBlockNames = Object.keys(themeJson.blocks ?? {}).sort();
  const manifestPageIds = (themeJson.pages ?? [])
    .map((p) => (typeof p.id === 'string' ? p.id : ''))
    .filter(Boolean);

  // Satin package pages exist iff the theme package ships seedable page JSON.
  const packagePagesExist = existsSync(
    resolve(SITES_ROOT, 'packages', 'theme-satin', 'pages'),
  );

  return {
    themeId: snapshot.themeId,
    features,
    manifestBlockNames,
    manifestPageIds,
    resolutionNames: snapshot.resolutions.map((r) => r.name).sort(),
    registryNames: snapshot.registry.map((r) => r.name).sort(),
    hasCheckoutResultPage: snapshot.hasCheckoutResultPage,
    puckDrivenPagesDeclared: features.puckDrivenPages === true,
    packagePagesExist,
    renderer: toRendererFacts(renderProbes),
    source: loadSourceFacts(),
  };
}
