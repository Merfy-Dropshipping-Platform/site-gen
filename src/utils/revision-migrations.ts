/**
 * Server-side revision migrations.
 *
 * Applied at read time (getRevision, build pipeline) so legacy revision
 * shapes converge to the current canonical structure without backfills.
 *
 * All migrations MUST be idempotent — running twice produces identical
 * output. New shapes must be detected by feature presence (e.g. "has Catalog
 * block in page-catalog content"), not by version number.
 */

type Block = { type?: string; props?: Record<string, unknown> };
type PageData = { content?: Block[]; root?: { props?: Record<string, unknown> }; zones?: Record<string, unknown> };

/**
 * 094: shared chrome helper. Returns Header/Footer blocks lifted from the
 * home page so all auto-seeded pages (catalog/product/cart/checkout/collection)
 * stay visually consistent with the merchant's home layout. Falls back to
 * minimal placeholder blocks if home lacks chrome (e.g. user removed it).
 *
 * IMPORTANT: returns the home blocks AS-IS (same object refs) — same pattern
 * used by `migrateCollectionPage`. This keeps the data shape predictable;
 * downstream code that deep-clones per page is responsible for unique IDs.
 */
function getHomeChrome(pagesData: Record<string, unknown>): {
  headerBlock: Block;
  footerBlock: Block;
} {
  const home = pagesData['home'] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content) ? (home!.content as Block[]) : [];
  const ts = Date.now();
  return {
    headerBlock:
      homeContent.find((b) => b?.type === 'Header') ?? {
        type: 'Header',
        props: { id: `Header-${ts}` },
      },
    footerBlock:
      homeContent.find((b) => b?.type === 'Footer') ?? {
        type: 'Footer',
        props: { id: `Footer-${ts + 1}` },
      },
  };
}

/**
 * 094: patches a content array so it starts with Header and ends with Footer.
 * If Header/Footer already exists ANYWHERE in content, leaves it (avoids
 * accidentally duplicating chrome when blocks are mid-array for non-standard
 * layouts). Used by migrate{Catalog,Product,Cart}Page to backfill existing
 * sites that were seeded without chrome (pre-094 bug).
 *
 * Idempotent: re-running on already-chromed content is a no-op (same length).
 */
function ensureChrome(content: Block[], pagesData: Record<string, unknown>): Block[] {
  const chrome = getHomeChrome(pagesData);
  const out = [...content];
  const hasHeader = out.some((b) => b?.type === 'Header');
  const hasFooter = out.some((b) => b?.type === 'Footer');
  if (!hasHeader) out.unshift(chrome.headerBlock);
  if (!hasFooter) out.push(chrome.footerBlock);
  return out;
}

/**
 * Cart page Puck-driven с 5 секциями (Figma 1:20818):
 *   CartBody / CartSummary / CartTotals / CartCheckoutButton / PopularProducts
 * (Раньше было 3: CartBody + CartSummary + Collections — но Figma требует
 * split CartSummary на 3 блока + cross-sell через PopularProducts.)
 *
 *   - Seeds default 5-block layout when `page-cart` is missing.
 *   - Idempotent: уже-мигрированные сайты получают патч добавляющий новые блоки
 *     CartTotals + CartCheckoutButton если их нет, и заменяет Collections
 *     на PopularProducts если только legacy seed (Collections с heading
 *     "Возможно вам понравится").
 *   - Has page-cart но нет CartBody → inserts 5 blocks before Footer.
 *   - Legacy CartSection всегда удаляется (preview ≡ live parity).
 */
function migrateCartPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-cart'] as PageData | undefined;
  const ts = Date.now();

  // Идемпотентный путь: уже есть CartBody — patch недостающие новые блоки.
  if (existing?.content?.some((b) => b?.type === 'CartBody')) {
    let content = (existing.content ?? []).filter((b) => b?.type !== 'CartSection');

    // Заменяем legacy Collections (cross-sell на cart) → PopularProducts
    // только если это типовой seed: heading "Возможно вам понравится" + cards=4.
    content = content.map((b) => {
      if (b?.type !== 'Collections') return b;
      const p = (b.props ?? {}) as Record<string, unknown>;
      const isLegacyCartSeed = p.heading === 'Возможно вам понравится' || p.id === 'Collections-cart' || String(p.id ?? '').startsWith('Collections-') && p.cards === 4;
      if (!isLegacyCartSeed) return b;
      return {
        type: 'PopularProducts',
        props: {
          id: `PopularProducts-cart-${ts}`,
          heading: 'Возможно вам понравится',
          cards: 4,
          columns: 4,
          colorScheme: 'scheme-2',
          padding: { top: 80, bottom: 80 },
        },
      };
    });

    // Insert CartTotals + CartCheckoutButton если ещё нет — после CartSummary.
    const hasTotals = content.some((b) => b?.type === 'CartTotals');
    const hasCheckoutBtn = content.some((b) => b?.type === 'CartCheckoutButton');
    if (!hasTotals || !hasCheckoutBtn) {
      const summaryIdx = content.findIndex((b) => b?.type === 'CartSummary');
      const insertAt = summaryIdx >= 0 ? summaryIdx + 1 : 1;
      const toInsert: Block[] = [];
      if (!hasTotals) {
        toInsert.push({
          type: 'CartTotals',
          props: { id: `CartTotals-${ts + 1}`, colorScheme: 'scheme-2', padding: { top: 0, bottom: 8 } },
        });
      }
      if (!hasCheckoutBtn) {
        toInsert.push({
          type: 'CartCheckoutButton',
          props: { id: `CartCheckoutButton-${ts + 2}`, colorScheme: 'scheme-2', padding: { top: 8, bottom: 80 } },
        });
      }
      content = [...content.slice(0, insertAt), ...toInsert, ...content.slice(insertAt)];
    }

    const patched = ensureChrome(content, pagesData);
    if (patched.length === (existing.content ?? []).length && patched.every((b, i) => b === (existing.content ?? [])[i])) {
      return pagesData;
    }
    return { ...pagesData, 'page-cart': { ...existing, content: patched } };
  }

  // Полный seed (новый сайт ИЛИ существующий без CartBody)
  const seedBlocks: Block[] = [
    {
      type: 'CartBody',
      props: { id: `CartBody-${ts}`, colorScheme: 'scheme-2', padding: { top: 80, bottom: 40 } },
    },
    {
      type: 'CartSummary',
      props: { id: `CartSummary-${ts + 1}`, colorScheme: 'scheme-2', padding: { top: 0, bottom: 0 } },
    },
    {
      type: 'CartTotals',
      props: { id: `CartTotals-${ts + 2}`, colorScheme: 'scheme-2', padding: { top: 0, bottom: 8 } },
    },
    {
      type: 'CartCheckoutButton',
      props: { id: `CartCheckoutButton-${ts + 3}`, colorScheme: 'scheme-2', padding: { top: 8, bottom: 80 } },
    },
    {
      type: 'PopularProducts',
      props: {
        id: `PopularProducts-cart-${ts + 4}`,
        heading: 'Возможно вам понравится',
        cards: 4,
        columns: 4,
        colorScheme: 'scheme-2',
        padding: { top: 80, bottom: 80 },
      },
    },
  ];

  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      'page-cart': {
        content: [chrome.headerBlock, ...seedBlocks, chrome.footerBlock],
        root: { props: { title: 'Корзина' } },
        zones: {},
      } as PageData,
    };
  }

  const cleaned = existing.content.filter((b) => b?.type !== 'CartSection');
  const footerIdx = cleaned.findIndex((b) => b?.type === 'Footer');
  const next = [...cleaned];
  if (footerIdx >= 0) {
    next.splice(footerIdx, 0, ...seedBlocks);
  } else {
    next.push(...seedBlocks);
  }
  const withChrome = ensureChrome(next, pagesData);
  return { ...pagesData, 'page-cart': { ...existing, content: withChrome } };
}

/**
 * 078 phase 4: catalog page is now a Puck-managed page (like home) using a
 * single Catalog block (filter sidebar + grid + pagination). Existing sites
 * have catalog page seeded as [Header, PopularProducts, Footer] from the old
 * createCatalogPageData seed. This migration:
 *
 *   - Adds a default page-catalog with a Catalog block when missing entirely.
 *   - Replaces a legacy PopularProducts on page-catalog with a Catalog block,
 *     BUT only when the page is the exact legacy seed
 *     `[Header, PopularProducts, Footer]`. Once the user has added other
 *     blocks (Hero/PromoBanner/Collections/Gallery/...), they are treated
 *     as having opted out of the auto Catalog widget and the page is left
 *     alone — this allows replicating reference catalog layouts (082).
 *
 * Idempotent: page-catalog already containing a Catalog block is left alone.
 */
function migrateCatalogPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-catalog'] as PageData | undefined;
  const ts = Date.now();
  // New default seed (082+): explicit cards/columns/filter/sort props so the
  // legacy [Header, PopularProducts, Footer] migration produces a Catalog
  // widget with the canonical 12 cards × 3 columns side-filter layout. Legacy
  // aliases (showCollectionFilter, showSidebar) are dropped — Catalog.astro
  // and live catalog.astro accept both shapes.
  const catalogBlock: Block = {
    type: 'Catalog',
    props: {
      id: `Catalog-${ts}`,
      collectionSlug: undefined,
      cards: 12,
      columns: 3,
      showFilter: 'true',
      filterPosition: 'side',
      showSort: 'true',
      colorScheme: 'scheme-2',
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      'page-catalog': {
        content: [chrome.headerBlock, catalogBlock, chrome.footerBlock],
        root: { props: { title: 'Коллекции' } },
        zones: {},
      } as PageData,
    };
  }

  const hasCatalog = existing.content.some((b) => b?.type === 'Catalog');
  if (hasCatalog) {
    // 094: patch chrome on already-seeded pages that lack Header/Footer
    // (pre-094 sites where [Catalog]-only was seeded by the broken migration).
    const patched = ensureChrome(existing.content, pagesData);
    if (patched.length === existing.content.length) return pagesData;
    return { ...pagesData, 'page-catalog': { ...existing, content: patched } };
  }

  // Only migrate the exact legacy seed [Header, PopularProducts, Footer]. If
  // the user has customised the page with additional blocks, leave it alone
  // (082 catalog reference layout uses Hero+Collections+PopularProducts+
  // Gallery without the functional Catalog widget).
  const types = existing.content.map((b) => b?.type).filter(Boolean) as string[];
  const isLegacySeed =
    types.length === 3 &&
    types[0] === 'Header' &&
    types[1] === 'PopularProducts' &&
    types[2] === 'Footer';
  if (!isLegacySeed) return pagesData;

  const popularIdx = existing.content.findIndex((b) => b?.type === 'PopularProducts');
  const nextContent = [...existing.content];
  nextContent[popularIdx] = catalogBlock;

  return {
    ...pagesData,
    'page-catalog': { ...existing, content: nextContent },
  };
}

/**
 * 082+ page-collection: collection detail pages (`/c/[slug]`) are now Puck-
 * managed via a single template `page-collection` that auto-scopes to the
 * Astro `params.slug` at render time. This migration seeds the default
 * [Header, Hero('{{COLLECTION_NAME}}'), Catalog (auto-scope), Footer] when
 * absent.
 *
 * Header/Footer are copied from the home page if present so chrome stays in
 * sync. Hero/Catalog use template variables ({{COLLECTION_NAME}},
 * {{COLLECTION_DESCRIPTION}}, {{COLLECTION_IMAGE}}) that the build pipeline
 * substitutes per-collection at render time.
 *
 * Idempotent: if `page-collection` already exists, returns pagesData unchanged.
 */
function migrateCollectionPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  if (pagesData['page-collection']) return pagesData;

  // Use home page header/footer as templates if available so chrome matches.
  const home = pagesData['home'] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content) ? (home!.content as Block[]) : [];
  const headerBlock = homeContent.find((b) => b?.type === 'Header');
  const footerBlock = homeContent.find((b) => b?.type === 'Footer');
  const ts = Date.now();

  const collectionContent: Block[] = [
    headerBlock ?? { type: 'Header', props: { id: `Header-collection-${ts}` } },
    {
      type: 'Hero',
      props: {
        id: `Hero-collection-${ts}`,
        variant: 'split',
        heading: { text: '{{COLLECTION_NAME}}', size: 'large' },
        subtitle: { content: '{{COLLECTION_DESCRIPTION}}', size: 'medium' },
        backgroundImage: '{{COLLECTION_IMAGE}}',
        padding: { top: 80, bottom: 80 },
      } as Record<string, unknown>,
    },
    {
      type: 'Catalog',
      props: {
        id: `Catalog-collection-${ts}`,
        // collectionSlug omitted → live page auto-scopes from Astro.params.slug
        cards: 24,
        columns: 3,
        showFilter: 'true',
        filterPosition: 'side',
        showSort: 'true',
        colorScheme: 'scheme-2',
        padding: { top: 40, bottom: 80 },
      } as Record<string, unknown>,
    },
    footerBlock ?? { type: 'Footer', props: { id: `Footer-collection-${ts}` } },
  ];

  return {
    ...pagesData,
    'page-collection': {
      content: collectionContent,
      root: { props: { meta: { title: '{{COLLECTION_NAME}}' } } },
      zones: {},
    } as PageData,
  };
}

/**
 * Контент-страницы (about/delivery/contacts) должны быть чистой страницей с
 * секцией Page. Старый конструкторский fallback `|| initialData` запекал в них
 * ДОМАШНИЙ шаблон (PromoBanner/Hero/Collections/PopularProducts/Newsletter).
 * Эта миграция заменяет такой home-junk на чистую [Header(home), Page, Footer(home)]
 * со СТАБИЛЬНЫМ id (`Page-<slug>`) — детерминированно на getRevision/preview/build,
 * без churn. Мерчант-контент (есть блок Page или иной набор) и отсутствующие
 * страницы НЕ трогает (replace-junk-only). Идемпотентна.
 *
 * Зеркало конструкторского `seedContentPages` (pupaMigrate.ts). Восстанавливает
 * гарантию, снятую конструкторским `eb8e480` (2026-06-08).
 */
const CONTENT_PAGE_TITLES: Record<string, string> = {
  'page-about': 'О нас',
  'page-delivery': 'Доставка',
  'page-contacts': 'Контакты',
};

// Типы блоков домашнего шаблона (initialData конструктора). Контент-страница
// РОВНО с этим набором и БЕЗ блока Page = «нейрослоп» (fallback на home), а не
// намеренный контент мерчанта.
const CONTENT_HOME_JUNK_TYPES = [
  'PromoBanner',
  'Header',
  'Hero',
  'Collections',
  'PopularProducts',
  'ImageWithText',
  'Newsletter',
  'Footer',
];

function isContentPageHomeJunk(content: Block[]): boolean {
  const types = content.map((b) => b?.type).filter(Boolean) as string[];
  if (types.includes('Page')) return false;
  if (types.length !== CONTENT_HOME_JUNK_TYPES.length) return false;
  return types.every((t, i) => t === CONTENT_HOME_JUNK_TYPES[i]);
}

function migrateContentPages(pagesData: Record<string, unknown>): Record<string, unknown> {
  const home = pagesData['home'] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content) ? (home!.content as Block[]) : [];
  const headerBlock = homeContent.find((b) => b?.type === 'Header');
  const footerBlock = homeContent.find((b) => b?.type === 'Footer');

  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, title] of Object.entries(CONTENT_PAGE_TITLES)) {
    const existing = out[pageId] as PageData | undefined;
    const content = Array.isArray(existing?.content) ? (existing!.content as Block[]) : null;
    // replace-junk-only: отсутствующие и мерчант-страницы не трогаем.
    if (!content || content.length === 0) continue;
    if (!isContentPageHomeJunk(content)) continue;

    const slug = pageId.replace(/^page-/, '');
    out[pageId] = {
      content: [
        headerBlock ?? { type: 'Header', props: { id: `Header-${slug}` } },
        {
          type: 'Page',
          props: {
            id: `Page-${slug}`,
            heading: title,
            content: '',
            headingSize: 'large',
            colorScheme: 'scheme-2',
            padding: { top: 80, bottom: 80 },
          },
        },
        footerBlock ?? { type: 'Footer', props: { id: `Footer-${slug}` } },
      ],
      root: { props: { meta: { title } } },
      zones: {},
    } as PageData;
    changed = true;
  }
  return changed ? out : pagesData;
}

/**
 * 078 page-product: page-product is now a Puck-managed template like home/
 * catalog. Existing sites may not have page-product in pagesData yet, so seed
 * the canonical default block list. Idempotent: pages already containing a
 * Product block are left untouched.
 *
 * Default seed: [Header, Product, PopularProducts, Newsletter, Footer]
 * (Header/Footer fall back to home page chrome at render time, so we only
 * seed Product/PopularProducts/Newsletter here.)
 */
function migrateProductPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-product'] as PageData | undefined;
  const ts = Date.now();
  const productBlock: Block = {
    type: 'Product',
    props: {
      id: `Product-${ts}`,
      productId: '',
      layout: 'two-columns',
      photoPosition: 'left',
      zoomMode: 'hover',
      colorScheme: 'scheme-2',
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };
  const popularBlock: Block = {
    type: 'PopularProducts',
    props: {
      id: `PopularProducts-${ts + 1}`,
      heading: 'Похожие товары',
      cards: 4,
      columns: 4,
      colorScheme: 'scheme-2',
      padding: { top: 60, bottom: 60 },
    } as Record<string, unknown>,
  };
  const newsletterBlock: Block = {
    type: 'Newsletter',
    props: {
      id: `Newsletter-${ts + 2}`,
      colorScheme: 'scheme-2',
      padding: { top: 40, bottom: 40 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      'page-product': {
        content: [chrome.headerBlock, productBlock, popularBlock, newsletterBlock, chrome.footerBlock],
        root: { props: { title: 'Товар' } },
        zones: {},
      } as PageData,
    };
  }

  const hasProduct = existing.content.some((b) => b?.type === 'Product');
  if (hasProduct) {
    // 094: patch chrome on already-seeded pages that lack Header/Footer.
    const patched = ensureChrome(existing.content, pagesData);
    if (patched.length === existing.content.length) return pagesData;
    return { ...pagesData, 'page-product': { ...existing, content: patched } };
  }

  // Has page-product but no Product block — insert before Footer or at end.
  const footerIdx = existing.content.findIndex((b) => b?.type === 'Footer');
  const nextContent = [...existing.content];
  if (footerIdx >= 0) {
    nextContent.splice(footerIdx, 0, productBlock);
  } else {
    nextContent.push(productBlock);
  }
  const withChrome = ensureChrome(nextContent, pagesData);
  return {
    ...pagesData,
    'page-product': { ...existing, content: withChrome },
  };
}

/**
 * Figma 1:19998: checkout page = 4 sections (Header / CheckoutForm /
 * CheckoutSummary / Footer). 6 form-side blocks (Contact/Delivery/Method/
 * Payment/Submit/Terms) консолидированы в CheckoutForm; OrderSummary + Totals
 * — в CheckoutSummary.
 *
 *   - Seeds Figma-canonical 4-block layout когда checkout missing.
 *   - Migrates legacy 11-block sites (080) → 4-block (collapse inner blocks
 *     in form/summary mega).
 *   - Idempotent: уже-мигрированные на 2-mega остаются.
 *   - Legacy `siteConfig.checkout` НЕ мигрируется — merchant settings
 *     теперь hardcoded в CheckoutForm.astro defaults.
 */
function migrateCheckoutPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  // Constructor uses `page-checkout` key, live `pages/checkout.astro` reads
  // `checkout`. Keep BOTH keys in sync (migrate either source → both).
  const out: Record<string, unknown> = { ...pagesData };
  const fromLegacy = out['page-checkout'] as PageData | undefined;
  const fromNew = out['checkout'] as PageData | undefined;
  const source = fromNew?.content?.length ? fromNew : fromLegacy;

  // Уже консолидирован в 2 mega-блока (новый Figma 1:19998 layout) — no-op.
  if (source && Array.isArray(source.content) && source.content.some((b) => b?.type === 'CheckoutForm')) {
    let chromed: PageData = source;
    if (!chromed.content!.some((b) => b?.type === 'Footer')) {
      const { footerBlock } = getHomeChrome(pagesData);
      chromed = { ...chromed, content: [...(chromed.content ?? []), footerBlock] };
    }
    out['checkout'] = chromed;
    out['page-checkout'] = chromed;
    return out;
  }

  // Legacy 080: имеет CheckoutLayout + 11 fine-grained блоков. Collapse в
  // [CheckoutHeader, CheckoutForm, CheckoutSummary, Footer]. Удаляем
  // 11 inner blocks (functionality сохраняется т.к. CheckoutForm рендерит
  // их через Astro imports с теми же дефолтами).
  if (source && Array.isArray(source.content) && source.content.some((b) => b?.type === 'CheckoutLayout')) {
    const ts0 = Date.now();
    const header = source.content.find((b) => b?.type === 'CheckoutHeader');
    const footer = source.content.find((b) => b?.type === 'Footer');
    const collapsed: Block[] = [
      header ?? {
        type: 'CheckoutHeader',
        props: {
          id: `CheckoutHeader-${ts0}`,
          siteTitle: 'Мой магазин',
          logoMode: 'text',
          logoImage: null,
          rightIcon: 'cart',
          accountLink: '/account',
          backLink: '/cart',
          cartLink: '/cart',
          padding: { top: 24, bottom: 24 },
        },
      },
      {
        type: 'CheckoutForm',
        props: { id: `CheckoutForm-${ts0 + 1}`, colorScheme: 'scheme-2', padding: { top: 0, bottom: 0 } },
      },
      {
        type: 'CheckoutSummary',
        props: { id: `CheckoutSummary-${ts0 + 2}`, colorScheme: 'scheme-2', padding: { top: 0, bottom: 0 } },
      },
      footer ?? getHomeChrome(pagesData).footerBlock,
    ];
    const chromed: PageData = { ...source, content: collapsed };
    out['checkout'] = chromed;
    out['page-checkout'] = chromed;
    return out;
  }
  // Figma 1:19998 — 2 mega-блока «Оформление заказа» + «Сводка заказа».
  // Inner config (Contact / Delivery / Payment fields, terms text, etc) —
  // hardcoded в CheckoutForm.astro / CheckoutSummary.astro defaults.
  const ts = Date.now();
  const seedBlocks: Block[] = [
    {
      type: 'CheckoutHeader',
      props: {
        id: `CheckoutHeader-${ts}`,
        siteTitle: 'Мой магазин',
        logoMode: 'text',
        logoImage: null,
        rightIcon: 'cart',
        accountLink: '/account',
        backLink: '/cart',
        cartLink: '/cart',
        padding: { top: 24, bottom: 24 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutForm',
      props: {
        id: `CheckoutForm-${ts + 1}`,
        colorScheme: 'scheme-2',
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutSummary',
      props: {
        id: `CheckoutSummary-${ts + 2}`,
        colorScheme: 'scheme-2',
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
  ];

  // 094: append Footer at end (CheckoutHeader stays as the checkout-specific
  // header variant; no global Header on checkout).
  const { footerBlock } = getHomeChrome(pagesData);
  const newPage: PageData = {
    content: [...seedBlocks, footerBlock],
    root: { props: { title: 'Оформление заказа' } },
    zones: {},
  };
  return {
    ...out,
    checkout: newPage,
    'page-checkout': newPage,
  };
}

/**
 * Spec 103: thank-you страница `/checkout-result` (CheckoutHeader +
 * OrderConfirmation «Спасибо за заказ»). Системная страница добавлена в
 * theme.json ПОСЛЕ того как существующие сайты достигли ревизии 2.0, поэтому
 * version-миграции её не бэкфилят. Аддитивно добавляем в pages[] + pagesData
 * (идемпотентно). Оперирует полной ревизией (нужен pages[]), а не только
 * pagesData. Вызывается ТОЛЬКО для rose — единственной темы с зарегистрированным
 * блоком OrderConfirmation.
 */
function seedCheckoutResultPage(
  out: Record<string, unknown>,
): Record<string, unknown> {
  const pagesData = (out.pagesData ?? {}) as Record<string, unknown>;
  const pages = Array.isArray(out.pages)
    ? (out.pages as Array<{ id?: string; slug?: string }>)
    : [];
  const hasContent =
    !!pagesData['page-checkout-result'] || !!pagesData['checkout-result'];
  const hasMeta = pages.some(
    (p) =>
      p?.id === 'page-checkout-result' ||
      (p?.slug ?? '').replace(/^\/+|\/+$/g, '') === 'checkout-result',
  );
  if (hasContent && hasMeta) return out; // already present — no-op (idempotent)

  const ts = Date.now();
  const seedPage: PageData = {
    content: [
      {
        type: 'CheckoutHeader',
        props: {
          id: `CheckoutHeader-${ts}`,
          siteTitle: 'Мой магазин',
          logoMode: 'text',
          logoImage: null,
          rightIcon: 'cart',
          accountLink: '/account',
          backLink: '/cart',
          cartLink: '/cart',
          padding: { top: 24, bottom: 24 },
        } as Record<string, unknown>,
      },
      {
        type: 'OrderConfirmation',
        props: {
          id: `OrderConfirmation-${ts + 1}`,
          colorScheme: 'scheme-2',
          padding: { top: 0, bottom: 0 },
        } as Record<string, unknown>,
      },
    ],
    root: { props: { title: 'Спасибо за заказ' } },
    zones: {},
  };

  const newPagesData = hasContent
    ? pagesData
    : { ...pagesData, 'page-checkout-result': seedPage };
  const newPages = hasMeta
    ? pages
    : [
        ...pages,
        {
          id: 'page-checkout-result',
          name: 'Спасибо за заказ',
          slug: '/checkout-result',
          role: 'system',
          contentFile: 'pages/checkout-result.json',
        },
      ];
  return { ...out, pages: newPages, pagesData: newPagesData };
}

/**
 * 084 Stage 1: vanilla home seed migration (T025 v2).
 *
 * Если `themeId === 'vanilla'` AND текущая версия миграции на pagesData
 * меньше `VANILLA_HOME_MIGRATION_VERSION` — заполняет home канонической
 * последовательностью 10 блоков
 * `[PromoBanner, Header, Slideshow, Collections, MainText, Video,
 *   ImageWithText, PopularProducts, Newsletter, Footer]` со ссылками на
 * коллекции `mebel` и `dekor` (соответствует Figma vanilla `1:18954`)
 * И запекает в каждый блок vanilla-specific props (logoPosition,
 * buttonStyle, formLayout, swatchOverlay, bottomStrip, и т.д.) — чтобы
 * мерчант видел эти variants в админке без зависимости от render-time
 * blockDefaults из theme.json.
 *
 * Idempotency anchor — version-based:
 *   `pagesData._vanillaHomeMigrationVersion` (number, ≥ 2 = уже мигрирован
 *   на текущую версию). Старая Hero-seed версия (без флага) считается
 *   version 0 и автоматически апгрейдится до version 2.
 *
 * Для не-vanilla тем home.content остаётся нетронутым. Применяется
 * только когда themeId явно передан.
 */
export const VANILLA_HOME_MIGRATION_VERSION = 11;

/**
 * 084 Stage 3 Task 6 (v11): vanilla-specific Catalog blockDefaults baked
 * onto Catalog blocks living in `page-catalog.content` and
 * `page-collection.content`.
 *
 * When `force=true` (used during the v10 → v11 transition), all 9 props
 * are overwritten unconditionally — interpreted as a destructive restyle
 * because `migrateCatalogPage` runs first in the orchestrator and pre-seeds
 * page-catalog with all-themes defaults (scheme-2/columns:3/padding:80),
 * which are Figma-incorrect for vanilla. Idempotent at v11+ (early return
 * in `migrateVanillaHomePage`) preserves any post-v11 merchant edits.
 *
 * When `force=false` (default), only undefined props get filled.
 */
const VANILLA_CATALOG_DEFAULTS: Record<string, unknown> = {
  filterPosition: 'side',
  showFilter: 'true',
  showSort: 'true',
  columns: 2,
  cards: 12,
  gridAspect: '1:1',
  cardCaptionStyle: 'uppercase',
  colorScheme: 'scheme-3',
  padding: { top: 120, bottom: 120 },
};

function applyVanillaCatalogDefaults(block: Block, force: boolean = false): Block {
  if (!block || block.type !== 'Catalog') return block;
  const props = (block.props ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...props };
  for (const [key, value] of Object.entries(VANILLA_CATALOG_DEFAULTS)) {
    if (force || merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return { ...block, props: merged };
}

export function migrateVanillaHomePage(
  pagesData: Record<string, unknown>,
  themeId: string | null | undefined,
): Record<string, unknown> {
  if (themeId !== 'vanilla') return pagesData;

  const currentVersionRaw = pagesData['_vanillaHomeMigrationVersion'];
  const currentVersion =
    typeof currentVersionRaw === 'number' && Number.isFinite(currentVersionRaw)
      ? currentVersionRaw
      : 0;
  if (currentVersion >= VANILLA_HOME_MIGRATION_VERSION) return pagesData;

  const existing = pagesData['home'] as PageData | undefined;
  const ts = Date.now();
  const seedBlocks: Block[] = [
    {
      type: 'PromoBanner',
      props: {
        id: `PromoBanner-${ts}`,
        text: 'СКИДКА 10% НА ПЕРВЫЙ ЗАКАЗ — ПРОМОКОД WELCOME10',
        link: { text: 'В каталог', href: '/catalog' },
        size: 'thin',
        textTransform: 'uppercase',
        colorScheme: 'scheme-1',
        padding: { top: 12, bottom: 12 },
      } as Record<string, unknown>,
    },
    {
      type: 'Header',
      props: {
        id: `Header-${ts + 1}`,
        siteTitle: 'Vanilla Pilot',
        logo: '',
        logoPosition: 'center-absolute',
        activeLinkIndicator: 'underline',
        stickiness: 'scroll-up',
        menuType: 'dropdown',
        navigationLinks: [
          { label: 'Каталог', href: '/catalog' },
          { label: 'Мебель', href: '/c/mebel' },
          { label: 'Декор', href: '/c/dekor' },
        ],
        actionButtons: { showSearch: true, showCart: true, showProfile: true },
        colorScheme: 'scheme-1',
        // 084 Stage 2 Task 4 (v4): 32px y-padding to hit Figma 1:18957 80px
        // header height. Pre-v4 seeded 16px (= 73px live, 7px short).
        padding: { top: 32, bottom: 32 },
      } as Record<string, unknown>,
    },
    {
      type: 'Hero',
      props: {
        id: 'Hero-vanilla-home',
        mode: 'carousel',
        size: 'large',
        alignment: 'left',
        contentAlign: 'left',
        imageFullBleed: true,
        buttonStyle: 'solid',
        pagination: 'numbers',
        autoplay: true,
        interval: 5,
        container: 'false',
        padding: { top: 0, bottom: 0 },
        title: '',
        subtitle: '',
        image: { url: '', alt: '' },
        cta: { text: '', href: '' },
        variant: 'overlay',
        slides: [
          {
            id: 'slide-vanilla-home-1',
            imageUrl: 'https://minio.merfy.ru/product-images/vanilla-pilot/mebel/1.jpg',
            heading: { text: 'Искусство жить уютно', size: 'large' },
            text: { content: 'Товары, создающие атмосферу тепла и спокойствия', size: 'medium' },
            buttonText: 'Перейти к коллекции',
            buttonLink: '/catalog',
          },
          {
            id: 'slide-vanilla-home-2',
            imageUrl: 'https://minio.merfy.ru/product-images/vanilla-pilot/mebel/15.jpg',
            heading: { text: 'Мебель ручной работы', size: 'large' },
            text: { content: 'Натуральные материалы и авторский дизайн', size: 'medium' },
            buttonText: 'Смотреть мебель',
            buttonLink: '/catalog/mebel',
          },
          {
            id: 'slide-vanilla-home-3',
            imageUrl: 'https://minio.merfy.ru/product-images/vanilla-pilot/dekor/1.jpg',
            heading: { text: 'Декор для дома', size: 'large' },
            text: { content: 'Уютные акценты для каждой комнаты', size: 'medium' },
            buttonText: 'Смотреть декор',
            buttonLink: '/catalog/dekor',
          },
        ],
      } as Record<string, unknown>,
    },
    {
      type: 'Collections',
      props: {
        id: `Collections-${ts + 3}`,
        heading: 'Коллекции',
        subtitle: 'Мебель и декор для уютного дома',
        headingSize: 'medium',
        // 084 Stage 2 Task 5 (v5): titleAlignment=left per Figma 1:18973
        // (items-start). Pre-v5 was 'center'.
        titleAlignment: 'left',
        imageView: 'square',
        gridAspect: '1:1',
        cardCaptionStyle: 'uppercase',
        dataSource: 'manual',
        collections: [
          {
            id: 'col-mebel',
            collectionId: 'mebel',
            heading: 'Мебель',
            description: 'Кресла, столы, стеллажи',
            image: '',
          },
          {
            id: 'col-dekor',
            collectionId: 'dekor',
            heading: 'Декор',
            description: 'Вазы, текстиль, аксессуары',
            image: '',
          },
        ],
        columns: 2,
        cardLinkBase: '/c/',
        colorScheme: 'scheme-3',
        // 084 Stage 2 Task 5 (v5): 120px y-padding per Figma 1:18973.
        // Pre-v5 was 80px (40px short of Figma).
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'MainText',
      props: {
        id: `MainText-${ts + 4}`,
        heading: { text: 'Тепло вашего дома начинается здесь', size: 'small' },
        text: {
          content:
            'Потому что настоящий уют рождается из деталей. Мы знаем, как важно возвращаться в дом, где каждая деталь дарит комфорт и радость. Натуральный хлопок, уютный велюр, мягкий лен и нежные оттенки — все это Vanila. Позвольте себе наслаждаться красотой в деталях и превратите повседневность в маленькое удовольствие. Создайте дом своей мечты вместе с Vanila.',
          size: 'small',
        },
        alignment: 'center',
        position: 'center',
        // 084 Stage 2 Task 6 (v6): use canonical `cta` shape (Astro reads
        // `cta`, not `button`) so the «К покупкам» button actually renders.
        cta: { text: 'К покупкам', href: '/catalog', variant: 'primary' },
        buttonStyle: 'outlined',
        textStyle: 'italic',
        // 084 Stage 2 Task 6 (v6): scheme-2 = `#3a4530` dark olive bg with
        // white text per Figma 1:18984. Pre-v6 used scheme-3 (light grey
        // `#eee`) which was an inverse of the design.
        colorScheme: 'scheme-2',
        // 084 Stage 2 Task 6 (v6): 120px y-padding per Figma 1:18984.
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'Video',
      props: {
        id: `Video-${ts + 5}`,
        heading: '',
        videoUrl: '',
        poster: '',
        position: 'contained',
        padded: true,
        align: 'container',
        // 084 Stage 2 Task 7 (v7): scheme-1 = brand-dark `#26311c`
        // (rgb 38 49 28) bg per Figma 1:18989. Pre-v7 used scheme-3
        // (light `#eee`) which inverted the design — Video must sit on
        // the same deep olive band as PromoBanner.
        colorScheme: 'scheme-1',
        // 084 Stage 2 Task 7 (v7): 120px y-padding per Figma 1:18989.
        // Pre-v7 was {top:0, bottom:80} (top padding missing entirely).
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'ImageWithText',
      props: {
        id: `ImageWithText-${ts + 6}`,
        image: { url: '', alt: 'Мебель ручной работы' },
        heading: { text: 'Качество российских мастеров', size: 'large' },
        text: {
          content:
            'Каждое изделие создано вручную — натуральные материалы, классические формы, современные акценты.',
          size: 'medium',
        },
        button: { text: 'Смотреть мебель', link: '/c/mebel' },
        imagePosition: 'right',
        ctaPosition: 'bottom-pinned',
        textStyle: 'italic',
        // 084 Stage 2 Task 8 (v8): scheme-2 = mid-olive `#3a4530`
        // (rgb 58 69 48) bg per Figma 1:18992 with white text + outlined
        // white CTA. Pre-v8 used scheme-3 (light `#eee`) which inverted
        // the design — block must sit on dark olive band.
        colorScheme: 'scheme-2',
        // 084 Stage 2 Task 8 (v8): 120px y-padding per Figma 1:18992.
        // Pre-v8 was 80/80 — too compact.
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'PopularProducts',
      props: {
        id: `PopularProducts-${ts + 7}`,
        heading: { text: 'Популярные товары', size: 'medium', alignment: 'left' },
        // 084 Stage 2 Task 9 (v9): Figma 1:18999 — 3-col × 2-row grid (6 cards),
        // 120px y-padding, heading left-aligned. Pre-v9 had cards:4/columns:4
        // (1-row only) and padding 80/80 (too tight).
        cards: 6,
        columns: 3,
        collection: 'mebel',
        cardCaptionStyle: 'uppercase',
        swatchOverlay: true,
        headingAlignment: 'left',
        quickAdd: false,
        quickAddText: 'В КОРЗИНУ',
        colorScheme: 'scheme-3',
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'Newsletter',
      props: {
        id: `Newsletter-${ts + 8}`,
        heading: { text: 'Будьте в курсе уютных новостей', size: 'medium', alignment: 'left' },
        text: {
          content:
            'Станьте частью сообщества Vanila. Вас ждут свежие идеи для уюта, анонсы новинок, полезные советы по уходу за текстилем и специальные промокоды для подписчиков.',
          size: 'small',
        },
        description:
          'Станьте частью сообщества Vanila. Вас ждут свежие идеи для уюта, анонсы новинок, полезные советы по уходу за текстилем и специальные промокоды для подписчиков.',
        placeholder: 'E-mail',
        buttonText: 'Отправить',
        formLayout: 'inline-submit',
        position: 'left',
        alignment: 'left',
        colorScheme: 'scheme-2',
        padding: { top: 120, bottom: 120 },
      } as Record<string, unknown>,
    },
    {
      type: 'Footer',
      props: {
        id: `Footer-${ts + 9}`,
        siteTitle: 'Vanilla Pilot',
        variant: '2-part-asymmetric',
        bottomStrip: {
          enabled: true,
          text: '© 2025 Vanilla Theme. Powered by Merfy',
        },
        copyright: { companyName: 'Vanilla Pilot', showYear: true },
        newsletter: {
          enabled: false,
          heading: '',
          description: '',
          placeholder: '',
        },
        heading: { text: '', size: 'medium', alignment: 'left' },
        text: { content: '', size: 'small' },
        navigationColumn: {
          title: 'Магазин',
          links: [
            { label: 'Каталог', href: '/catalog' },
            { label: 'Мебель', href: '/c/mebel' },
            { label: 'Декор', href: '/c/dekor' },
          ],
        },
        informationColumn: {
          title: 'Информация',
          links: [
            { label: 'Доставка', href: '/delivery' },
            { label: 'Контакты', href: '/contacts' },
          ],
        },
        socialColumn: {
          title: 'Связь',
          email: '',
          socialLinks: [],
        },
        colorScheme: 'scheme-1',
        padding: { top: 80, bottom: 40 },
      } as Record<string, unknown>,
    },
  ];

  const baseExisting: PageData = existing && typeof existing === 'object' ? existing : { content: [] };

  // 084 Stage 3 Task 6 (v11): bake vanilla Catalog defaults onto Catalog blocks
  // in page-catalog and page-collection. Force-override (force=true) replaces
  // pre-existing values unconditionally because we only reach this branch when
  // currentVersion < VANILLA_HOME_MIGRATION_VERSION — the v10 → v11 transition
  // is interpreted as a destructive restyle to overwrite migrateCatalogPage's
  // all-themes seed (scheme-2/columns:3/padding:80). At v11+ the early return
  // above preserves merchant edits.
  const pageCatalogRaw = pagesData['page-catalog'] as PageData | undefined;
  const updatedPageCatalog =
    pageCatalogRaw && Array.isArray(pageCatalogRaw.content)
      ? { ...pageCatalogRaw, content: pageCatalogRaw.content.map((b) => applyVanillaCatalogDefaults(b, true)) }
      : pageCatalogRaw;

  const pageCollectionRaw = pagesData['page-collection'] as PageData | undefined;
  const updatedPageCollection =
    pageCollectionRaw && Array.isArray(pageCollectionRaw.content)
      ? { ...pageCollectionRaw, content: pageCollectionRaw.content.map((b) => applyVanillaCatalogDefaults(b, true)) }
      : pageCollectionRaw;

  return {
    ...pagesData,
    _vanillaHomeMigrationVersion: VANILLA_HOME_MIGRATION_VERSION,
    home: {
      ...baseExisting,
      content: seedBlocks,
      root: baseExisting.root ?? { props: { title: 'Главная' } },
      zones: baseExisting.zones ?? {},
    } as PageData,
    ...(updatedPageCatalog ? { 'page-catalog': updatedPageCatalog } : {}),
    ...(updatedPageCollection ? { 'page-collection': updatedPageCollection } : {}),
  };
}

/**
 * Apply all server-side migrations to a revision data object. Mutates a
 * shallow copy — input is not modified.
 *
 * `themeId` опционален — если передан, активируется theme-specific
 * миграция (на текущий момент только vanilla home seed). Без themeId
 * theme-specific шаги пропускаются (back-compat для legacy callers).
 */
/** Плейсхолдер-телефон верстальщиков (засевался во все темы). */
const FOOTER_PLACEHOLDER_PHONE = '+7 (000) 000-00-00';
/**
 * Плейсхолдер-почты сидов/тем. Покрывает: `example@…` (example@bloom.ru,
 * example@vanila.merfy), `…@example.…` (rose@example.ru, info@example.ru) и
 * RFC-зарезервированный TLD `.example` (hello@satin.example). Реальные адреса
 * под эти шаблоны не попадают (`.example` не регистрируется, `example@` — явный
 * пример). */
const FOOTER_PLACEHOLDER_EMAIL = /(?:^example@|@example\.|\.example$)/i;

/**
 * Нормализация контактных данных футера (idempotent). Чистит демо-плейсхолдеры,
 * чтобы конструктор и превью показывали футер как «не настроено» — зеркалит live,
 * где build авторитетно подставляет данные из «Политика и контакты» / Theme
 * Settings / подключённой кассы:
 *  • телефон-плейсхолдер «+7 (000) 000-00-00» → удалить;
 *  • placeholder-email (rose@example.ru / example@vanila.merfy и т.п.) → удалить;
 *  • соцсети с пустым href или «#» → выкинуть;
 *  • правовые ссылки с href «#» или «/legal/…» (ведут в никуда) → выкинуть.
 * Реальные данные (введённые мерчантом) под паттерны не попадают и не трогаются.
 */
function normalizeFooterContacts(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    if (!page || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = page.content.map((block) => {
      const b = block as { type?: string; props?: Record<string, unknown> };
      if (!b || b.type !== 'Footer' || !b.props) return block;
      const props = { ...b.props } as Record<string, any>;
      let blockChanged = false;

      if (
        typeof props.phone === 'string' &&
        props.phone.trim() === FOOTER_PLACEHOLDER_PHONE
      ) {
        delete props.phone;
        blockChanged = true;
      }

      if (props.socialColumn && typeof props.socialColumn === 'object') {
        const social = { ...(props.socialColumn as Record<string, any>) };
        let socialChanged = false;
        if (
          typeof social.email === 'string' &&
          FOOTER_PLACEHOLDER_EMAIL.test(social.email.trim())
        ) {
          delete social.email;
          socialChanged = true;
        }
        if (Array.isArray(social.socialLinks)) {
          const filtered = social.socialLinks.filter(
            (s: any) =>
              s &&
              typeof s.href === 'string' &&
              s.href.trim() !== '' &&
              s.href.trim() !== '#',
          );
          if (filtered.length !== social.socialLinks.length) {
            social.socialLinks = filtered;
            socialChanged = true;
          }
        }
        if (socialChanged) {
          props.socialColumn = social;
          blockChanged = true;
        }
      }

      if (props.informationColumn && typeof props.informationColumn === 'object') {
        const info = { ...(props.informationColumn as Record<string, any>) };
        if (Array.isArray(info.links)) {
          const filtered = info.links.filter(
            (l: any) =>
              l &&
              typeof l.href === 'string' &&
              l.href.trim() !== '#' &&
              !l.href.trim().startsWith('/legal/'),
          );
          if (filtered.length !== info.links.length) {
            info.links = filtered;
            props.informationColumn = info;
            blockChanged = true;
          }
        }
      }

      if (!blockChanged) return block;
      pageChanged = true;
      return { ...b, props };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * Strip "designer demo" content from decorative image sections.
 *
 * theme.json `blockDefaults` seeded Hero/MultiRows/ImageWithText/Gallery/
 * Slideshow/Video with demo MinIO images (bag photos etc.). The theme ports
 * render a Figma empty-state placeholder ONLY when the section is empty — so
 * an untouched demo section showed the bag photo instead of the placeholder.
 *
 * Detection is by KNOWN demo URL (captured from blockDefaults across all 5
 * themes). If a decorative section still carries one of these demo images it
 * is considered untouched → its content props are stripped so the port falls
 * back to the Figma placeholder. ANY other image URL (a merchant upload) is
 * left intact. Idempotent: once stripped there is no demo URL left to match.
 */
const DEMO_IMAGE_URLS = new Set<string>([
  'https://minio.merfy.ru/product-images/113f237c-bc9d-4026-940f-362c34d5edef.png',
  'https://minio.merfy.ru/product-images/1352e026-ad8e-40e0-82ea-313f6d28f0a8.webp',
  'https://minio.merfy.ru/product-images/2174e491-b84a-4fe9-969b-03e7cfb4c6cb.png',
  'https://minio.merfy.ru/product-images/2bcd0822-b566-44b3-a973-024a544bd81b.png',
  'https://minio.merfy.ru/product-images/3d8e5b82-77b2-4a05-add9-d8b507b928de.png',
  'https://minio.merfy.ru/product-images/42581ed8-e00c-44f7-9554-3b180e2dbbf4.png',
  'https://minio.merfy.ru/product-images/493706c0-98af-4425-ba6b-5e4f4c451690.png',
  'https://minio.merfy.ru/product-images/5065b5f2-813a-482f-955f-79d59961781d.webp',
  'https://minio.merfy.ru/product-images/52a3d7a3-c4ef-4cee-839a-9c3cc4138d5f.webp',
  'https://minio.merfy.ru/product-images/5dd8c01f-5f9e-4e25-94e6-51a3f939f7c2.webp',
  'https://minio.merfy.ru/product-images/72b8fafa-5500-4547-b8c8-b1aeede1abe7.webp',
  'https://minio.merfy.ru/product-images/80db2fe6-9f38-4d7f-9be8-7b7a7377f8e1.png',
  'https://minio.merfy.ru/product-images/9e3891ac-1176-4963-a3ff-460111eec56e.webp',
  'https://minio.merfy.ru/product-images/a08a9591-3935-4083-aeb8-27a010b418f6.webp',
  'https://minio.merfy.ru/product-images/b6f44849-58b3-4ca7-9a29-6b0c77bec440.webp',
  'https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png',
  'https://minio.merfy.ru/product-images/c35a2f11-cc45-4e3c-9c1a-6fec10024a30.webp',
  'https://minio.merfy.ru/product-images/c7d5a251-242a-4796-b27d-ce6378b2f50c.png',
  'https://minio.merfy.ru/product-images/ca659a74-5488-435f-9884-64428bfe12af.webp',
  'https://minio.merfy.ru/product-images/cbcbb53f-b2ee-4e9d-87a9-54630568c5b1.webp',
  'https://minio.merfy.ru/product-images/cdc1fcbd-6e1e-4ac6-b734-5978ce57e2f5.png',
  'https://minio.merfy.ru/product-images/d237e918-2224-4823-a689-582ecda2e575.png',
  'https://minio.merfy.ru/product-images/d6b22fd7-98ea-40d6-ac2c-c5d4a17ded7e.webp',
  'https://minio.merfy.ru/product-images/d8d0bc51-183f-4509-b517-150066b71bad.png',
  'https://minio.merfy.ru/product-images/d95952a6-28e9-43d5-8702-160327f714e0.webp',
  'https://minio.merfy.ru/product-images/da44068b-c2be-4e68-8b2f-cbfd14df10e3.webp',
  'https://minio.merfy.ru/product-images/e901c239-7331-4421-854c-5cdbfd2200a7.png',
  'https://minio.merfy.ru/product-images/ebd21164-eabe-4eaa-ab34-a87716858be7.png',
  'https://minio.merfy.ru/product-images/f1f5ec7f-bf52-49fe-bf00-e46b15900881.webp',
  'https://minio.merfy.ru/product-images/f76f3053-7cfa-4823-894a-ce30fee3f1e0.png',
  'https://minio.merfy.ru/product-images/f92e309e-009c-4e15-85cc-87a59a439dea.png',
  'https://minio.merfy.ru/product-images/fa7923db-e2cd-4e1b-8353-d9a3650f2fb8.webp',
  'https://minio.merfy.ru/product-images/fbc737b0-c024-4b0a-8a8a-05dff445f628.webp',
  'https://minio.merfy.ru/product-images/ff8fdfad-e787-4884-91e4-68f2d9b24b68.png',
  'https://minio.merfy.ru/product-images/fff03c6b-af2d-4637-8b9a-83063c8f8155.webp',
]);

/**
 * Sections whose untouched designer-demo state → Figma placeholder. All carry a
 * known demo image in their default content (Hero/MultiColumns demo via the
 * shared c02b5c8c.png etc.), so the demo-URL match below catches them without
 * fragile text matching. Merchant-uploaded images (any other URL) keep the
 * section intact.
 */
const DEMO_IMAGE_SECTION_TYPES = new Set<string>([
  'Hero',
  'MultiRows',
  'ImageWithText',
  'Gallery',
  'Slideshow',
  'Video',
  'MultiColumns',
  // Collections only stripped when it carries a demo image (e.g. satin unsplash
  // covers with collectionId:null). Real picked collections use merchant/minio
  // covers → not matched → kept.
  'Collections',
]);

/** Content-bearing props stripped when a section is detected as untouched demo. */
const DEMO_CONTENT_PROPS = [
  'image',
  'imageUrl',
  'backgroundImage',
  'backgroundImages',
  'rows',
  'slides',
  'items',
  'tiles',
  'columns',
  'sections',
  'collections',
  'heading',
  'text',
  'title',
  'subtitle',
  'button',
  'primaryButton',
  'secondaryButton',
  'cta',
  'ctaText',
  'ctaUrl',
  'videoUrl',
  'poster',
  'content',
];

function valueContainsDemoImage(value: unknown): boolean {
  if (typeof value === 'string') {
    // satin's theme defaults ship unsplash demo photos; any other host is
    // treated as a real merchant upload and left intact.
    return DEMO_IMAGE_URLS.has(value) || value.includes('images.unsplash.com');
  }
  if (Array.isArray(value)) return value.some(valueContainsDemoImage);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      valueContainsDemoImage,
    );
  }
  return false;
}

function clearDemoImageSections(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let mutated = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    const content = page?.content;
    if (!Array.isArray(content)) continue;
    let pageMutated = false;
    const newContent = content.map((b) => {
      if (!b || typeof b !== 'object' || !b.type) return b;
      if (!DEMO_IMAGE_SECTION_TYPES.has(b.type)) return b;
      const props = b.props;
      if (!props || !valueContainsDemoImage(props)) return b;
      const cleaned: Record<string, unknown> = { ...props };
      for (const p of DEMO_CONTENT_PROPS) delete cleaned[p];
      pageMutated = true;
      return { ...b, props: cleaned };
    });
    if (pageMutated) {
      out[pageId] = { ...(page as PageData), content: newContent };
      mutated = true;
    }
  }
  return mutated ? out : pagesData;
}

/**
 * Figma 1:21431 — подсекция «Варианты» секции Product разделена на 2 свитчера:
 * displayStyle (Стиль: button/list) + shape (Вариации: circle/square/none). Старые
 * ревизии держат merged `style` (button/circle/square/list) без displayStyle →
 * конструктор-свитчеры показали бы пустую выборку. Read-time backfill displayStyle+
 * shape из legacy style/shape, сохраняя итоговый mode (та же деривация что в
 * Product.astro). Идемпотентно: если displayStyle уже задан — блок не трогаем.
 */
function backfillProductVariants(pagesData: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, page] of Object.entries(pagesData)) {
    const pd = page as PageData | undefined;
    const content = Array.isArray(pd?.content) ? (pd!.content as Block[]) : null;
    if (!content) continue;
    let pageChanged = false;
    const newContent = content.map((block) => {
      if (block?.type !== 'Product') return block;
      const props = (block.props ?? {}) as Record<string, unknown>;
      const variants = (props.variants ?? {}) as Record<string, unknown>;
      if (typeof variants.displayStyle === 'string') return block; // уже новая модель
      const style = typeof variants.style === 'string' ? variants.style : '';
      const shape = typeof variants.shape === 'string' ? variants.shape : '';
      // Legacy-деривация итогового mode (зеркало Product.astro).
      const mode =
        style === 'circle' || style === 'square'
          ? style
          : style === 'list'
            ? 'list'
            : shape === 'circle' || shape === 'square'
              ? shape
              : 'button';
      const displayStyle = mode === 'list' ? 'list' : 'button';
      const newShape = mode === 'circle' || mode === 'square' ? mode : 'none';
      pageChanged = true;
      return { ...block, props: { ...props, variants: { ...variants, displayStyle, shape: newShape } } };
    });
    if (pageChanged) {
      out[pageId] = { ...(pd as object), content: newContent };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

export function migrateRevisionData(
  data: Record<string, unknown> | null | undefined,
  themeId?: string | null,
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = { ...data };
  const pagesData = out.pagesData;
  if (pagesData && typeof pagesData === 'object') {
    out.pagesData = migrateCatalogPage(pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateCollectionPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateContentPages(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateProductPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateCartPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateCheckoutPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateVanillaHomePage(out.pagesData as Record<string, unknown>, themeId);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = normalizeFooterContacts(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = clearDemoImageSections(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = backfillProductVariants(out.pagesData as Record<string, unknown>);
  }
  // Spec 103/109: thank-you `/checkout-result`. Оперирует полной ревизией
  // (touches pages[] + pagesData), поэтому после pagesData-сидеров.
  if (themeId === 'rose' || themeId === 'flux') {
    return seedCheckoutResultPage(out);
  }
  return out;
}
