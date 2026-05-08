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
 * Generate /collections/[slug].astro for vanilla theme — Puck-driven page
 * for parameterized collection routes. Reads page-collection content from
 * revision data (data.json) and walks blocks via theme registry. Template
 * variables ({{COLLECTION_NAME}}, {{COLLECTION_DESCRIPTION}}, {{COLLECTION_IMAGE}})
 * are substituted per-collection.
 *
 * 085 Stage 3.5 + 086 architectural refactor:
 * - getStaticPaths reads collections.json (build-time static, no fetch).
 * - Page content comes from pagesData['page-collection'].content (Puck JSON).
 * - Template variables substituted recursively in props.
 * - Catalog block gets collectionSlug={slug} injected for runtime scoping.
 *
 * NO hardcoded layout values — конструктор ≡ live for ALL blocks.
 */
export function generateVanillaCollectionsSlugPage(
  _config: DynamicPageConfig,
): string {
  return `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import data from '../../data/data.json';
import collectionsData from '../../data/collections.json';

import Header from '../../components/Header.astro';
import Hero from '../../components/Hero.astro';
import Catalog from '../../components/Catalog.astro';
import Footer from '../../components/Footer.astro';
import PromoBanner from '../../components/PromoBanner.astro';
import Newsletter from '../../components/Newsletter.astro';
import Collections from '../../components/Collections.astro';
import PopularProducts from '../../components/PopularProducts.astro';
import MainText from '../../components/MainText.astro';
import Video from '../../components/Video.astro';
import ImageWithText from '../../components/ImageWithText.astro';
import Gallery from '../../components/Gallery.astro';
import ContactForm from '../../components/ContactForm.astro';
import CollapsibleSection from '../../components/CollapsibleSection.astro';
import MultiColumns from '../../components/MultiColumns.astro';
import MultiRows from '../../components/MultiRows.astro';
import Slideshow from '../../components/Slideshow.astro';
import Publications from '../../components/Publications.astro';
import Product from '../../components/Product.astro';

export function getStaticPaths() {
  const cols: any[] = Array.isArray(collectionsData) ? collectionsData : [];
  if (cols.length === 0) {
    return [{ params: { slug: '_placeholder' }, props: { collection: null } }];
  }
  const paths: { params: { slug: string }; props: { collection: any } }[] = [];
  const seen = new Set<string>();
  for (const c of cols) {
    for (const slug of [c.slug, c.handle, c.id].filter(Boolean) as string[]) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      paths.push({ params: { slug }, props: { collection: c } });
      break;
    }
  }
  return paths;
}

const { slug } = Astro.params;
const { collection } = Astro.props as { collection: any };
const collectionTitle = (collection && (collection.title || collection.name)) || 'Каталог';
const collectionDescription = (collection && collection.description) || '';
const collectionImage = (collection && collection.image) || '';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[] }>;
const rawContent = (allPagesData['page-collection']?.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

function substituteVars(value: any): any {
  if (typeof value === 'string') {
    return value
      .replace(/\\{\\{COLLECTION_NAME\\}\\}/g, collectionTitle)
      .replace(/\\{\\{COLLECTION_DESCRIPTION\\}\\}/g, collectionDescription)
      .replace(/\\{\\{COLLECTION_IMAGE\\}\\}/g, collectionImage);
  }
  if (Array.isArray(value)) return value.map(substituteVars);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) out[k] = substituteVars(value[k]);
    return out;
  }
  return value;
}

const blocks = rawContent.map((b) => ({ ...b, props: substituteVars(b.props ?? {}) }));
---
<BaseLayout title={collectionTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} collectionSlug={slug} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} />;
    return null;
  })}
</BaseLayout>
`;
}

/**
 * Generate /collections/[slug].astro for bloom theme — Puck-driven page.
 * Mirror of generateVanillaCollectionsSlugPage. Replaces deleted
 * templates/astro/bloom/src/pages/collections/[slug].astro.
 *
 * 089 Bundle 5 (US1 Sub-A): single common implementation для всех тем
 * через package theme-base/blocks. Bloom уникальные стили — через
 * theme.json blockDefaults (no theme-specific code).
 *
 * NO hardcoded layout values — конструктор ≡ live invariant.
 */
export function generateBloomCollectionsSlugPage(
  _config: DynamicPageConfig,
): string {
  return `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import data from '../../data/data.json';
import collectionsData from '../../data/collections.json';

import Header from '../../components/Header.astro';
import Hero from '../../components/Hero.astro';
import Catalog from '../../components/Catalog.astro';
import Footer from '../../components/Footer.astro';
import PromoBanner from '../../components/PromoBanner.astro';
import Newsletter from '../../components/Newsletter.astro';
import Collections from '../../components/Collections.astro';
import PopularProducts from '../../components/PopularProducts.astro';
import MainText from '../../components/MainText.astro';
import Video from '../../components/Video.astro';
import ImageWithText from '../../components/ImageWithText.astro';
import Gallery from '../../components/Gallery.astro';
import ContactForm from '../../components/ContactForm.astro';
import CollapsibleSection from '../../components/CollapsibleSection.astro';
import MultiColumns from '../../components/MultiColumns.astro';
import MultiRows from '../../components/MultiRows.astro';
import Slideshow from '../../components/Slideshow.astro';
import Publications from '../../components/Publications.astro';
import Product from '../../components/Product.astro';

export function getStaticPaths() {
  const cols: any[] = Array.isArray(collectionsData) ? collectionsData : [];
  if (cols.length === 0) {
    return [{ params: { slug: '_placeholder' }, props: { collection: null } }];
  }
  const paths: { params: { slug: string }; props: { collection: any } }[] = [];
  const seen = new Set<string>();
  for (const c of cols) {
    for (const slug of [c.slug, c.handle, c.id].filter(Boolean) as string[]) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      paths.push({ params: { slug }, props: { collection: c } });
      break;
    }
  }
  return paths;
}

const { slug } = Astro.params;
const { collection } = Astro.props as { collection: any };
const collectionTitle = (collection && (collection.title || collection.name)) || 'Каталог';
const collectionDescription = (collection && collection.description) || '';
const collectionImage = (collection && collection.image) || '';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[] }>;
const rawContent = (allPagesData['page-collection']?.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

function substituteVars(value: any): any {
  if (typeof value === 'string') {
    return value
      .replace(/\\{\\{COLLECTION_NAME\\}\\}/g, collectionTitle)
      .replace(/\\{\\{COLLECTION_DESCRIPTION\\}\\}/g, collectionDescription)
      .replace(/\\{\\{COLLECTION_IMAGE\\}\\}/g, collectionImage);
  }
  if (Array.isArray(value)) return value.map(substituteVars);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) out[k] = substituteVars(value[k]);
    return out;
  }
  return value;
}

const blocks = rawContent.map((b) => ({ ...b, props: substituteVars(b.props ?? {}) }));
---
<BaseLayout title={collectionTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} collectionSlug={slug} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} />;
    return null;
  })}
</BaseLayout>
`;
}

/**
 * Generate /catalog.astro for vanilla theme — Puck-driven landing page
 * showing all products (no collection scope). Replaces the deleted
 * templates/astro/vanilla/src/pages/catalog.astro which used CatalogIsland.tsx.
 *
 * Reads page-catalog content from revision data (data.json) and walks
 * blocks via theme registry. NO collection scoping — Catalog block
 * runs unscoped (inline-script fetches all products).
 *
 * 086 Stage 4 architectural refactor:
 * - Single static route (no getStaticPaths)
 * - Page content from pagesData['page-catalog'].content (Puck JSON)
 * - All blocks rendered via theme-base components
 * - NO hardcoded layout values — конструктор ≡ live invariant.
 *
 * Layout import path uses `../layouts/` (one level up from
 * src/pages/catalog.astro → src/layouts/).
 */
export function generateVanillaCatalogPage(_config: DynamicPageConfig): string {
  return `---
import BaseLayout from '../layouts/BaseLayout.astro';
import data from '../data/data.json';

import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
import Catalog from '../components/Catalog.astro';
import Footer from '../components/Footer.astro';
import PromoBanner from '../components/PromoBanner.astro';
import Newsletter from '../components/Newsletter.astro';
import Collections from '../components/Collections.astro';
import PopularProducts from '../components/PopularProducts.astro';
import MainText from '../components/MainText.astro';
import Video from '../components/Video.astro';
import ImageWithText from '../components/ImageWithText.astro';
import Gallery from '../components/Gallery.astro';
import ContactForm from '../components/ContactForm.astro';
import CollapsibleSection from '../components/CollapsibleSection.astro';
import MultiColumns from '../components/MultiColumns.astro';
import MultiRows from '../components/MultiRows.astro';
import Slideshow from '../components/Slideshow.astro';
import Publications from '../components/Publications.astro';
import Product from '../components/Product.astro';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[]; root?: any }>;
const pageData = allPagesData['page-catalog'] ?? { content: [] };
const blocks = (pageData.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

const rootProps = (pageData as any)?.root?.props ?? {};
const pageTitle = (typeof rootProps.title === 'string' && rootProps.title) || 'Каталог';
---
<BaseLayout title={pageTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} />;
    return null;
  })}
</BaseLayout>
`;
}

/**
 * Generate /catalog.astro for bloom theme — Puck-driven landing page.
 * Mirror generateVanillaCatalogPage. Replaces deleted
 * templates/astro/bloom/src/pages/catalog.astro которая использовала CatalogIsland.tsx.
 *
 * 089 Bundle 6 (US1 Sub-B): single common implementation через package блоки.
 * Bloom-уникальные стили — через theme.json blockDefaults (no theme-specific code).
 *
 * Layout import: `../layouts/` (depth-1).
 */
export function generateBloomCatalogPage(_config: DynamicPageConfig): string {
  return `---
import BaseLayout from '../layouts/BaseLayout.astro';
import data from '../data/data.json';

import Header from '../components/Header.astro';
import Hero from '../components/Hero.astro';
import Catalog from '../components/Catalog.astro';
import Footer from '../components/Footer.astro';
import PromoBanner from '../components/PromoBanner.astro';
import Newsletter from '../components/Newsletter.astro';
import Collections from '../components/Collections.astro';
import PopularProducts from '../components/PopularProducts.astro';
import MainText from '../components/MainText.astro';
import Video from '../components/Video.astro';
import ImageWithText from '../components/ImageWithText.astro';
import Gallery from '../components/Gallery.astro';
import ContactForm from '../components/ContactForm.astro';
import CollapsibleSection from '../components/CollapsibleSection.astro';
import MultiColumns from '../components/MultiColumns.astro';
import MultiRows from '../components/MultiRows.astro';
import Slideshow from '../components/Slideshow.astro';
import Publications from '../components/Publications.astro';
import Product from '../components/Product.astro';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[]; root?: any }>;
const pageData = allPagesData['page-catalog'] ?? { content: [] };
const blocks = (pageData.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

const rootProps = (pageData as any)?.root?.props ?? {};
const pageTitle = (typeof rootProps.title === 'string' && rootProps.title) || 'Каталог';
---
<BaseLayout title={pageTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} />;
    return null;
  })}
</BaseLayout>
`;
}

/**
 * Generate /product/[handle].astro for bloom theme — Puck-driven product
 * detail page. Mirror generateVanillaProductPage. Replaces deleted
 * templates/astro/bloom/src/pages/product/[id].astro которая использовала ProductIsland.tsx.
 *
 * 089 Bundle 7 (US1 Sub-C): single common implementation через package блоки.
 * Layout import: `../../layouts/` (depth-2). Product block получает productId={handle}.
 */
export function generateBloomProductPage(_config: DynamicPageConfig): string {
  return `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import data from '../../data/data.json';
import productsData from '../../data/products.json';

import Header from '../../components/Header.astro';
import Hero from '../../components/Hero.astro';
import Catalog from '../../components/Catalog.astro';
import Footer from '../../components/Footer.astro';
import PromoBanner from '../../components/PromoBanner.astro';
import Newsletter from '../../components/Newsletter.astro';
import Collections from '../../components/Collections.astro';
import PopularProducts from '../../components/PopularProducts.astro';
import MainText from '../../components/MainText.astro';
import Video from '../../components/Video.astro';
import ImageWithText from '../../components/ImageWithText.astro';
import Gallery from '../../components/Gallery.astro';
import ContactForm from '../../components/ContactForm.astro';
import CollapsibleSection from '../../components/CollapsibleSection.astro';
import MultiColumns from '../../components/MultiColumns.astro';
import MultiRows from '../../components/MultiRows.astro';
import Slideshow from '../../components/Slideshow.astro';
import Publications from '../../components/Publications.astro';
import Product from '../../components/Product.astro';

export function getStaticPaths() {
  const prods: any[] = Array.isArray(productsData) ? productsData : [];
  if (prods.length === 0) {
    return [{ params: { handle: '_placeholder' }, props: { product: null } }];
  }
  const paths: { params: { handle: string }; props: { product: any } }[] = [];
  const seen = new Set<string>();
  for (const p of prods) {
    for (const handle of [p.slug, p.handle, p.id].filter(Boolean) as string[]) {
      if (seen.has(handle)) continue;
      seen.add(handle);
      paths.push({ params: { handle }, props: { product: p } });
      break;
    }
  }
  return paths;
}

const { handle } = Astro.params;
const { product } = Astro.props as { product: any };
const productTitle = (product && (product.title || product.name)) || 'Товар';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[]; root?: any }>;
const pageData = allPagesData['page-product'] ?? { content: [] };
const blocks = (pageData.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

const rootProps = (pageData as any)?.root?.props ?? {};
const pageTitle = (typeof rootProps.title === 'string' && rootProps.title) || productTitle;
---
<BaseLayout title={pageTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} productId={handle} />;
    return null;
  })}
</BaseLayout>
`;
}

/**
 * Generate /product/[handle].astro for vanilla theme — Puck-driven product
 * detail page. Replaces deleted templates/astro/vanilla/src/pages/product/[id].astro
 * which used ProductIsland.tsx React island.
 *
 * Reads page-product content from revision data (data.json) + iterates
 * products.json for getStaticPaths. Catalog Walking pattern: each block
 * type rendered via theme registry components. Product block receives
 * productId prop for runtime scoping (Product.astro accepts slug/handle/id polymorphically via resolveProduct).
 *
 * 087 Stage 5 — final React island removal in vanilla.
 */
export function generateVanillaProductPage(_config: DynamicPageConfig): string {
  return `---
import BaseLayout from '../../layouts/BaseLayout.astro';
import data from '../../data/data.json';
import productsData from '../../data/products.json';

import Header from '../../components/Header.astro';
import Hero from '../../components/Hero.astro';
import Catalog from '../../components/Catalog.astro';
import Footer from '../../components/Footer.astro';
import PromoBanner from '../../components/PromoBanner.astro';
import Newsletter from '../../components/Newsletter.astro';
import Collections from '../../components/Collections.astro';
import PopularProducts from '../../components/PopularProducts.astro';
import MainText from '../../components/MainText.astro';
import Video from '../../components/Video.astro';
import ImageWithText from '../../components/ImageWithText.astro';
import Gallery from '../../components/Gallery.astro';
import ContactForm from '../../components/ContactForm.astro';
import CollapsibleSection from '../../components/CollapsibleSection.astro';
import MultiColumns from '../../components/MultiColumns.astro';
import MultiRows from '../../components/MultiRows.astro';
import Slideshow from '../../components/Slideshow.astro';
import Publications from '../../components/Publications.astro';
import Product from '../../components/Product.astro';

export function getStaticPaths() {
  const prods: any[] = Array.isArray(productsData) ? productsData : [];
  if (prods.length === 0) {
    return [{ params: { handle: '_placeholder' }, props: { product: null } }];
  }
  const paths: { params: { handle: string }; props: { product: any } }[] = [];
  const seen = new Set<string>();
  for (const p of prods) {
    for (const handle of [p.slug, p.handle, p.id].filter(Boolean) as string[]) {
      if (seen.has(handle)) continue;
      seen.add(handle);
      paths.push({ params: { handle }, props: { product: p } });
      break;
    }
  }
  return paths;
}

const { handle } = Astro.params;
const { product } = Astro.props as { product: any };
const productTitle = (product && (product.title || product.name)) || 'Товар';

const allPagesData = ((data as any)?.pagesData ?? {}) as Record<string, { content?: any[]; root?: any }>;
const pageData = allPagesData['page-product'] ?? { content: [] };
const blocks = (pageData.content ?? []) as Array<{ type: string; props: Record<string, any> }>;

const rootProps = (pageData as any)?.root?.props ?? {};
const pageTitle = (typeof rootProps.title === 'string' && rootProps.title) || productTitle;
---
<BaseLayout title={pageTitle}>
  {blocks.map((block) => {
    if (block.type === 'Header') return <Header {...block.props} />;
    if (block.type === 'Hero') return <Hero {...block.props} />;
    if (block.type === 'Catalog') return <Catalog {...block.props} />;
    if (block.type === 'Footer') return <Footer {...block.props} />;
    if (block.type === 'PromoBanner') return <PromoBanner {...block.props} />;
    if (block.type === 'Newsletter') return <Newsletter {...block.props} />;
    if (block.type === 'Collections') return <Collections {...block.props} />;
    if (block.type === 'PopularProducts') return <PopularProducts {...block.props} />;
    if (block.type === 'MainText') return <MainText {...block.props} />;
    if (block.type === 'Video') return <Video {...block.props} />;
    if (block.type === 'ImageWithText') return <ImageWithText {...block.props} />;
    if (block.type === 'Gallery') return <Gallery {...block.props} />;
    if (block.type === 'ContactForm') return <ContactForm {...block.props} />;
    if (block.type === 'CollapsibleSection') return <CollapsibleSection {...block.props} />;
    if (block.type === 'MultiColumns') return <MultiColumns {...block.props} />;
    if (block.type === 'MultiRows') return <MultiRows {...block.props} />;
    if (block.type === 'Slideshow') return <Slideshow {...block.props} />;
    if (block.type === 'Publications') return <Publications {...block.props} />;
    if (block.type === 'Product') return <Product {...block.props} productId={handle} />;
    return null;
  })}
</BaseLayout>
`;
}


// Rose theme — aliases bloom auto-gen functions (identical Puck-driven page
// shape, single source of truth via theme-base packages). Per spec 082 +
// Bundle 3-5 of rose pilot. Keeps rose pages in lockstep with bloom: any
// future change to bloom-* generators automatically applies to rose too.
export const generateRoseCollectionsSlugPage = generateBloomCollectionsSlugPage;
export const generateRoseCatalogPage = generateBloomCatalogPage;
export const generateRoseProductPage = generateBloomProductPage;
