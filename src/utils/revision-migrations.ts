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
 * 081: cart page is now Puck-managed with 3 blocks (CartBody + CartSummary +
 * Collections). Existing sites either have no `page-cart` in pagesData or
 * have a legacy seed. This migration:
 *
 *   - Seeds default 3-block layout when `page-cart` is missing.
 *   - Idempotent: pages that already contain a CartBody have their legacy
 *     CartSection block removed (keeps preview ≡ live, since rose cart.astro
 *     skips CartSection entirely on live render).
 *   - Has page-cart but no CartBody → inserts 3 blocks before Footer (or
 *     appends if no Footer) AND removes any legacy CartSection.
 */
function migrateCartPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  const existing = pagesData['page-cart'] as PageData | undefined;

  if (existing?.content?.some((b) => b?.type === 'CartBody')) {
    const hasLegacy = existing.content?.some((b) => b?.type === 'CartSection');
    if (!hasLegacy) {
      return pagesData;
    }
    const cleaned = (existing.content ?? []).filter((b) => b?.type !== 'CartSection');
    return { ...pagesData, 'page-cart': { ...existing, content: cleaned } };
  }

  const ts = Date.now();
  const seedBlocks: Block[] = [
    {
      type: 'CartBody',
      props: {
        id: `CartBody-${ts}`,
        colorScheme: 'scheme-1',
        padding: { top: 80, bottom: 40 },
      },
    },
    {
      type: 'CartSummary',
      props: {
        id: `CartSummary-${ts + 1}`,
        colorScheme: 'scheme-1',
        padding: { top: 0, bottom: 80 },
      },
    },
    {
      type: 'Collections',
      props: {
        id: `Collections-${ts + 2}`,
        heading: 'Возможно вам понравится',
        cards: 4,
        columns: 4,
        showCompareAtPrice: 'true',
        cardStyle: 'portrait',
        colorScheme: 'scheme-1',
        padding: { top: 80, bottom: 80 },
      },
    },
  ];

  if (!existing || !Array.isArray(existing.content)) {
    return {
      ...pagesData,
      'page-cart': {
        content: seedBlocks,
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
  return { ...pagesData, 'page-cart': { ...existing, content: next } };
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
      colorScheme: 'scheme-1',
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    return {
      ...pagesData,
      'page-catalog': {
        content: [catalogBlock],
        root: { props: { title: 'Коллекции' } },
        zones: {},
      } as PageData,
    };
  }

  const hasCatalog = existing.content.some((b) => b?.type === 'Catalog');
  if (hasCatalog) return pagesData;

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
        colorScheme: 'scheme-1',
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
      colorScheme: 'scheme-1',
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
      colorScheme: 'scheme-1',
      padding: { top: 60, bottom: 60 },
    } as Record<string, unknown>,
  };
  const newsletterBlock: Block = {
    type: 'Newsletter',
    props: {
      id: `Newsletter-${ts + 2}`,
      colorScheme: 'scheme-1',
      padding: { top: 40, bottom: 40 },
    } as Record<string, unknown>,
  };

  if (!existing || !Array.isArray(existing.content)) {
    return {
      ...pagesData,
      'page-product': {
        content: [productBlock, popularBlock, newsletterBlock],
        root: { props: { title: 'Товар' } },
        zones: {},
      } as PageData,
    };
  }

  const hasProduct = existing.content.some((b) => b?.type === 'Product');
  if (hasProduct) return pagesData;

  // Has page-product but no Product block — insert before Footer or at end.
  const footerIdx = existing.content.findIndex((b) => b?.type === 'Footer');
  const nextContent = [...existing.content];
  if (footerIdx >= 0) {
    nextContent.splice(footerIdx, 0, productBlock);
  } else {
    nextContent.push(productBlock);
  }
  return {
    ...pagesData,
    'page-product': { ...existing, content: nextContent },
  };
}

/**
 * 080 phase 6: checkout page is now Puck-managed with 11 fine-grained Checkout*
 * blocks (Header / Layout shell with form/summary slots / Contact / Delivery /
 * DeliveryMethod / Payment / OrderSummary / Totals / Submit / Terms /
 * SummaryToggle). Existing sites have either no `checkout` page or a legacy
 * `siteConfig.checkout` flat object. This migration:
 *
 *   - Seeds a default 11-block layout when `pagesData.checkout` is missing.
 *   - Idempotent: pages that already contain a CheckoutLayout block are left.
 *   - Does NOT migrate `siteConfig.checkout` — those merchant settings are
 *     wired through the live page Astro template (separate fallback).
 */
function migrateCheckoutPage(pagesData: Record<string, unknown>): Record<string, unknown> {
  // Constructor uses `page-checkout` key, live `pages/checkout.astro` reads
  // `checkout`. Keep BOTH keys in sync (migrate either source → both).
  const out: Record<string, unknown> = { ...pagesData };
  const fromLegacy = out['page-checkout'] as PageData | undefined;
  const fromNew = out['checkout'] as PageData | undefined;
  const source = fromNew?.content?.length ? fromNew : fromLegacy;
  if (source && Array.isArray(source.content) && source.content.some((b) => b?.type === 'CheckoutLayout')) {
    // Already migrated — patch in-place fixes for fields that have changed
    // semantics over time, then keep both keys in sync.
    for (const block of source.content) {
      if (block?.type === 'CheckoutDeliveryForm') {
        const props = (block.props ?? {}) as Record<string, unknown>;
        const country = (props.country ?? {}) as Record<string, unknown>;
        // Force the country field into dropdown mode for all existing sites —
        // readonly was a transient default that never matched the design.
        if (country.selectable !== true) {
          props.country = { ...country, selectable: true };
          block.props = props;
        }
      }
    }
    out['checkout'] = source;
    out['page-checkout'] = source;
    return out;
  }
  const ts = Date.now();
  const seedBlocks: Block[] = [
    {
      type: 'CheckoutHeader',
      props: {
        id: `CheckoutHeader-${ts}`,
        siteTitle: 'Мой магазин',
        logoMode: 'text',
        logoImage: null,
        // Per Figma 1:13563 — checkout header shows the cart icon, not the
        // account/avatar one. Aligns with the icon shown in the design.
        rightIcon: 'cart',
        accountLink: '/account',
        backLink: '/cart',
        cartLink: '/cart',
        padding: { top: 24, bottom: 24 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutSummaryToggle',
      props: {
        id: `CheckoutSummaryToggle-${ts + 1}`,
        headerText: 'Сводка заказа',
        dropdownIcon: 'chevron',
        responsive: { showOnMobile: true, showOnDesktop: false },
        padding: { top: 12, bottom: 12 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutLayout',
      props: {
        id: `CheckoutLayout-${ts + 2}`,
        summaryPosition: 'right',
        formColumnWidth: 652,
        summaryColumnWidth: 884,
        gap: 64,
        breakpoint: 768,
        // Per Figma 1:13398 — top spacing comes from formColumn pt-16; keep top:0.
        padding: { top: 0, bottom: 80 },
      } as Record<string, unknown>,
      // Slots populated below via zones; keeping as flat content[] for the seed.
    },
    {
      type: 'CheckoutContactForm',
      props: {
        id: `CheckoutContactForm-${ts + 3}`,
        heading: 'Контакты',
        showAuthLink: true,
        authLinkText: 'Войти в аккаунт',
        authLinkHref: '/login?next=/checkout',
        emailLabel: 'E-mail',
        phoneLabel: 'Номер телефона',
        phoneFormat: 'ru',
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutDeliveryForm',
      props: {
        id: `CheckoutDeliveryForm-${ts + 4}`,
        heading: 'Доставка',
        country: { enabled: true, default: 'Российская Федерация', selectable: true },
        nameField: { enabled: true, splitFirstLast: true },
        cityDadata: true,
        addressDadata: true,
        indexAutoFill: true,
        requiredFields: ['email', 'phone', 'name', 'address', 'index'],
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutDeliveryMethod',
      props: {
        id: `CheckoutDeliveryMethod-${ts + 5}`,
        heading: 'Способ доставки',
        cdekEnabled: true,
        cdekDoorLabel: 'Курьер до двери',
        cdekPvzLabel: 'До пункта выдачи',
        pickupEnabled: false,
        pickupLabel: 'Самовывоз',
        customMethods: [],
        freeShippingThresholdCents: null,
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutPayment',
      props: {
        id: `CheckoutPayment-${ts + 6}`,
        heading: 'Платёжная система',
        subheading: 'Все транзакции безопасны и зашифрованы',
        methods: [
          { key: 'bank_card', enabled: true, label: 'Банковская карта' },
          { key: 'sbp', enabled: true, label: 'СБП (Система быстрых платежей)' },
          { key: 'sberbank', enabled: false, label: 'Sber Pay' },
          { key: 'tinkoff_bank', enabled: false, label: 'T-Pay' },
        ],
        cardForm: { cvvHelpEnabled: true, nameOnCardEnabled: true, warningText: 'Счёт будет выставлен по вашему адресу' },
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutOrderSummary',
      props: {
        id: `CheckoutOrderSummary-${ts + 7}`,
        heading: 'Сводка заказа',
        itemImageSize: 'compact',
        showVariantLabels: true,
        showCompareAtPrice: true,
        promoToggle: { enabled: true, label: 'У меня есть промокод', applyButtonText: 'Применить' },
        bogoBadge: true,
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutTotals',
      props: {
        id: `CheckoutTotals-${ts + 8}`,
        deliveryLabel: 'Доставка',
        freeText: 'Бесплатно',
        totalLabel: 'Итого',
        showSubtotal: false,
        showDiscount: true,
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutSubmit',
      props: {
        id: `CheckoutSubmit-${ts + 9}`,
        buttonText: 'Оплатить {total}',
        buttonStyle: 'fill',
        loadingText: 'Обработка платежа…',
        successRedirectUrl: '/checkout-result',
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: 'CheckoutTerms',
      props: {
        id: `CheckoutTerms-${ts + 10}`,
        text: 'Размещая заказ, вы соглашаетесь с [Условиями обслуживания](/legal/terms), [Политикой конфиденциальности](/legal/privacy) и [Политикой использования файлов cookie](/legal/cookies).',
        links: [
          { label: 'Условия обслуживания', url: '/legal/terms' },
          { label: 'Политика конфиденциальности', url: '/legal/privacy' },
          { label: 'Политика использования файлов cookie', url: '/legal/cookies' },
        ],
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
  ];

  const newPage: PageData = {
    content: seedBlocks,
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
 * Apply all server-side migrations to a revision data object. Mutates a
 * shallow copy — input is not modified.
 */
export function migrateRevisionData(
  data: Record<string, unknown> | null | undefined,
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
    out.pagesData = migrateProductPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateCartPage(out.pagesData as Record<string, unknown>);
  }
  if (out.pagesData && typeof out.pagesData === 'object') {
    out.pagesData = migrateCheckoutPage(out.pagesData as Record<string, unknown>);
  }
  return out;
}
