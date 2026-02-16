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
${indent}          <a href={'/products/' + (product.slug || product.handle || product.id)}>
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
