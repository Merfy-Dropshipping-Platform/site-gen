/**
 * Dynamic Pages Generator — generates [handle].astro files with getStaticPaths
 * for products and collections.
 *
 * At Astro build time, getStaticPaths fetches all products/collections from the
 * store API and generates a static page for each one.
 */

/** Configuration for dynamic page generation */
export interface DynamicPageConfig {
  /** Base API URL for fetching data at build time (e.g. "https://gateway.merfy.ru/api") */
  apiUrl: string;
  /** Shop/site ID used to scope API requests */
  shopId: string;
  /** Layout import path (e.g. "../layouts/StoreLayout.astro") */
  layoutImport?: string;
  /** Layout tag name (e.g. "StoreLayout") */
  layoutTag?: string;
}

/**
 * Generate /products/[handle].astro — a dynamic page for individual products.
 *
 * Uses getStaticPaths to fetch all products at build time and generate
 * a static page for each product handle.
 */
export function generateProductPage(config: DynamicPageConfig): string {
  const { apiUrl, shopId, layoutImport, layoutTag } = config;

  const imports: string[] = [];
  if (layoutImport && layoutTag) {
    imports.push(`import ${layoutTag} from '${layoutImport}';`);
  }

  const frontmatter = `${imports.join("\n")}

export async function getStaticPaths() {
  let products = [];
  try {
    const res = await fetch('${apiUrl}/store/${shopId}/products');
    const json = await res.json();
    products = json.success ? (json.data ?? []) : [];
  } catch {
    // Build-time fetch failed — generate no product pages
    products = [];
  }
  return products.map((p) => ({
    params: { handle: p.slug || p.handle || p.id },
    props: { product: p },
  }));
}

const { product } = Astro.props;

function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(typeof price === 'number' && price > 1000 ? price / 100 : price);
}`;

  const openLayout = layoutTag ? `<${layoutTag}>` : "";
  const closeLayout = layoutTag ? `</${layoutTag}>` : "";
  const indent = layoutTag ? "  " : "";

  const template = `${openLayout}
${indent}<article class="product-detail">
${indent}  <div class="product-images">
${indent}    {product.images && product.images.length > 0 ? (
${indent}      <img src={product.images[0]} alt={product.name} class="product-main-image" />
${indent}    ) : (
${indent}      <div class="product-image-placeholder">Нет фото</div>
${indent}    )}
${indent}    {product.images && product.images.length > 1 && (
${indent}      <div class="product-thumbnails">
${indent}        {product.images.slice(1).map((img) => (
${indent}          <img src={img} alt={product.name} class="product-thumbnail" loading="lazy" />
${indent}        ))}
${indent}      </div>
${indent}    )}
${indent}  </div>
${indent}  <div class="product-info">
${indent}    <h1 class="product-title">{product.name}</h1>
${indent}    {product.description && <p class="product-description">{product.description}</p>}
${indent}    <div class="product-price">{formatPrice(product.price)}</div>
${indent}    <button class="buy-button" data-product-id={product.id} data-product-name={product.name} data-product-price={product.price}>
${indent}      Купить
${indent}    </button>
${indent}  </div>
${indent}</article>
${closeLayout}`.trim();

  return `---\n${frontmatter}\n---\n${template}\n`;
}

/**
 * Generate /collections/[handle].astro — a dynamic page for collections.
 *
 * Uses getStaticPaths to fetch all collections at build time and generate
 * a static page for each collection handle with its products.
 */
export function generateCollectionPage(config: DynamicPageConfig): string {
  const { apiUrl, shopId, layoutImport, layoutTag } = config;

  const imports: string[] = [];
  if (layoutImport && layoutTag) {
    imports.push(`import ${layoutTag} from '${layoutImport}';`);
  }

  const frontmatter = `${imports.join("\n")}

export async function getStaticPaths() {
  let collections = [];
  try {
    const res = await fetch('${apiUrl}/store/${shopId}/collections');
    const json = await res.json();
    collections = json.success ? (json.data ?? []) : [];
  } catch {
    collections = [];
  }

  // For each collection, also fetch its products
  const paths = [];
  for (const c of collections) {
    let products = [];
    try {
      const pRes = await fetch('${apiUrl}/store/${shopId}/collections/' + (c.handle || c.id) + '/products');
      const pJson = await pRes.json();
      products = pJson.success ? (pJson.data ?? []) : [];
    } catch {
      products = [];
    }
    paths.push({
      params: { handle: c.handle || c.slug || c.id },
      props: { collection: c, products },
    });
  }
  return paths;
}

const { collection, products } = Astro.props;

function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(typeof price === 'number' && price > 1000 ? price / 100 : price);
}`;

  const openLayout = layoutTag ? `<${layoutTag}>` : "";
  const closeLayout = layoutTag ? `</${layoutTag}>` : "";
  const indent = layoutTag ? "  " : "";

  const template = `${openLayout}
${indent}<section class="collection-page">
${indent}  <h1 class="collection-title">{collection.name}</h1>
${indent}  {collection.description && <p class="collection-description">{collection.description}</p>}
${indent}  {products.length === 0 ? (
${indent}    <p class="no-products">Товары скоро появятся</p>
${indent}  ) : (
${indent}    <div class="product-grid">
${indent}      {products.map((product) => (
${indent}        <article class="product-card">
${indent}          <a href={'/product/' + (product.slug || product.handle || product.id)}>
${indent}            <div class="product-image-wrapper">
${indent}              {product.images && product.images[0] ? (
${indent}                <img src={product.images[0]} alt={product.name} class="product-image" loading="lazy" />
${indent}              ) : (
${indent}                <div class="product-image-placeholder">Нет фото</div>
${indent}              )}
${indent}            </div>
${indent}            <div class="product-info">
${indent}              <h3 class="product-name">{product.name}</h3>
${indent}              <div class="product-price">{formatPrice(product.price)}</div>
${indent}            </div>
${indent}          </a>
${indent}        </article>
${indent}      ))}
${indent}    </div>
${indent}  )}
${indent}</section>
${closeLayout}`.trim();

  return `---\n${frontmatter}\n---\n${template}\n`;
}

/**
 * Generate /catalog/[slug].astro — uniform redirect to /collections/[slug].
 *
 * Stage 3 (spec 084) introduces /catalog/[slug] as the canonical SEO route.
 * To avoid coupling to per-theme component paths (vanilla doesn't ship a
 * `components/Catalog.astro` — it uses CatalogIsland with local JSON data),
 * we generate /catalog/[slug] as a 301 redirect to the existing working
 * /collections/[slug] page that every theme already ships.
 *
 * Trade-off: /catalog/[slug] returns 301 → 200 (instead of direct 200), but
 * `curl -sL` (follow redirects) sees 200 — same UX. SEO-wise 301 preserves
 * link equity to the new canonical /catalog/ namespace.
 */
export function generateCatalogSlugPage(_config: DynamicPageConfig): string {
  return `---
/* 084-stage3-uniform-catalog-redirect */
import collectionsData from '../../data/collections.json';

export function getStaticPaths() {
  const cols: any[] = Array.isArray(collectionsData) ? collectionsData : [];
  if (cols.length === 0) {
    return [{ params: { slug: '_placeholder' }, props: {} }];
  }
  const paths: { params: { slug: string }; props: Record<string, never> }[] = [];
  const seen = new Set<string>();
  for (const c of cols) {
    for (const slug of [c.id, c.slug, c.handle].filter(Boolean) as string[]) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      paths.push({ params: { slug }, props: {} });
    }
  }
  return paths;
}

const { slug } = Astro.params;
return Astro.redirect(\`/collections/\${slug}\`, 301);
---`;
}

/**
 * Generate /collections/[slug].astro for vanilla theme — Puck-driven
 * canonical collections page. Mirrors the structure of vanilla pilot's
 * page-collection Puck JSON (Header → Hero → Catalog → Footer) with
 * vanilla blockDefaults baked into Catalog (per migration v11).
 *
 * Layout import path uses `../../layouts/` (двух levels up from
 * src/pages/collections/[slug].astro → src/layouts/).
 *
 * 085 Stage 3.5 — replaces hardcoded
 * templates/astro/vanilla/src/pages/collections/[slug].astro deleted in
 * the same commit. Other themes (rose/satin/bloom/flux) preserve their
 * own theme-shipped collections/[slug].astro — this function runs ONLY
 * when scaffold-builder detects themeName === 'vanilla'.
 */
export function generateVanillaCollectionsSlugPage(
  config: DynamicPageConfig,
): string {
  const { apiUrl, shopId, layoutImport, layoutTag } = config;

  const imports: string[] = [];
  if (layoutImport && layoutTag) {
    imports.push(`import ${layoutTag} from '${layoutImport}';`);
  }
  imports.push(`import Header from '../../components/Header.astro';`);
  imports.push(`import Hero from '../../components/Hero.astro';`);
  imports.push(`import Catalog from '../../components/Catalog.astro';`);
  imports.push(`import Footer from '../../components/Footer.astro';`);

  const frontmatter = `${imports.join("\n")}

export async function getStaticPaths() {
  let collections = [];
  try {
    const res = await fetch('${apiUrl}/store/${shopId}/collections');
    const json = await res.json();
    collections = json.success ? (json.data ?? []) : [];
  } catch {
    collections = [];
  }
  return collections.map((c) => ({
    params: { slug: c.slug || c.handle || c.id },
    props: { collection: c },
  }));
}

const { slug } = Astro.params;
const { collection } = Astro.props;
const collectionTitle = (collection && (collection.title || collection.name)) || 'Каталог';
const collectionDescription = (collection && collection.description) || '';
const collectionImage = (collection && collection.image) || '';`;

  const openLayout = layoutTag ? `<${layoutTag} title={collectionTitle}>` : "";
  const closeLayout = layoutTag ? `</${layoutTag}>` : "";

  const template = `${openLayout}
  <Header
    siteTitle="Vanilla Pilot"
    logoPosition="center-absolute"
    activeLinkIndicator="underline"
    stickiness="scroll-up"
    menuType="dropdown"
    navigationLinks={[
      { label: 'Каталог', href: '/catalog' },
      { label: 'Мебель', href: '/collections/mebel' },
      { label: 'Декор', href: '/collections/dekor' },
    ]}
    actionButtons={{ showSearch: true, showCart: true, showProfile: true }}
    colorScheme="scheme-1"
    padding={{ top: 32, bottom: 32 }}
  />
  <Hero
    mode="single"
    size="medium"
    alignment="left"
    contentAlign="left"
    imageFullBleed={true}
    buttonStyle="solid"
    container="false"
    padding={{ top: 0, bottom: 0 }}
    title={collectionTitle}
    subtitle={collectionDescription}
    image={{ url: collectionImage, alt: collectionTitle }}
    cta={{ text: '', href: '' }}
  />
  <Catalog
    collectionSlug={slug}
    cards={12}
    columns={2}
    showFilter="true"
    showSort="true"
    filterPosition="side"
    colorScheme="scheme-3"
    gridAspect="1:1"
    cardCaptionStyle="uppercase"
    padding={{ top: 120, bottom: 120 }}
  />
  <Footer
    siteTitle="Vanilla Pilot"
    variant="2-part-asymmetric"
    bottomStrip={{ enabled: true, text: '© 2026 Vanilla Theme. Powered by Merfy' }}
    copyright={{ companyName: 'Vanilla Pilot', showYear: true }}
    newsletter={{ enabled: false, heading: '', description: '', placeholder: '' }}
    heading={{ text: '', size: 'medium', alignment: 'left' }}
    text={{ content: '', size: 'small' }}
    navigationColumn={{
      title: 'Магазин',
      links: [
        { label: 'Каталог', href: '/catalog' },
        { label: 'Мебель', href: '/collections/mebel' },
        { label: 'Декор', href: '/collections/dekor' },
      ],
    }}
    informationColumn={{
      title: 'Информация',
      links: [
        { label: 'Доставка', href: '/delivery' },
        { label: 'Контакты', href: '/contacts' },
      ],
    }}
    socialColumn={{ title: 'Связь', email: '', socialLinks: [] }}
    colorScheme="scheme-1"
    padding={{ top: 80, bottom: 40 }}
  />
${closeLayout}`.trim();

  return `---\n${frontmatter}\n---\n${template}\n`;
}
