/**
 * Satin Theme — Component Registry
 *
 * Maps all 20 Puck component types to their corresponding Astro components
 * in templates/astro/satin/src/components/.
 */
import type { ComponentRegistryEntry } from "../page-generator";

function staticComponent(
  name: string,
  astroFile: string,
): ComponentRegistryEntry {
  return {
    name,
    kind: "static",
    importPath: `../components/${astroFile}`,
  };
}

/**
 * Build a registry entry that points at a packages-managed block (pattern rose).
 *
 * `assembleFromPackages` копирует source из
 * `packages/theme-satin/blocks/<X>/<X>.astro` (+ siblings) в
 * `<scaffold>/src/components/<X>.astro` перед build, поэтому relative import
 * `../components/<X>.astro` резолвится без workspace/Vite alias.
 */
function packageComponent(
  name: string,
  blockDir: string,
): ComponentRegistryEntry {
  return {
    name,
    kind: "static",
    importPath: `../components/${blockDir}.astro`,
  };
}

export const satinRegistry: Record<string, ComponentRegistryEntry> = {
  Header: staticComponent("Header", "Header.astro"),
  Hero: staticComponent("Hero", "Hero.astro"),
  Footer: staticComponent("Footer", "Footer.astro"),
  MainText: staticComponent("MainText", "TextBlock.astro"),
  PopularProducts: staticComponent("PopularProducts", "PopularProducts.astro"),
  Collections: staticComponent("Collections", "Collections.astro"),
  ContactForm: staticComponent("ContactForm", "ContactForm.astro"),
  Gallery: staticComponent("Gallery", "Gallery.astro"),
  PromoBanner: staticComponent("PromoBanner", "PromoBanner.astro"),
  ImageWithText: staticComponent("ImageWithText", "ImageWithText.astro"),
  Newsletter: staticComponent("Newsletter", "Newsletter.astro"),
  Video: staticComponent("Video", "Video.astro"),
  Slideshow: staticComponent("Slideshow", "Slideshow.astro"),
  MultiColumns: staticComponent("MultiColumns", "MultiColumns.astro"),
  MultiRows: staticComponent("MultiRows", "MultiRows.astro"),
  CollapsibleSection: staticComponent(
    "CollapsibleSection",
    "CollapsibleSection.astro",
  ),
  Publications: staticComponent("Publications", "Publications.astro"),
  Page: staticComponent("Page", "Page.astro"),
  Product: staticComponent("Product", "Product.astro"),
  CartSection: staticComponent("CartSection", "CartSection.astro"),
  CheckoutSection: staticComponent("CheckoutSection", "CheckoutSection.astro"),
  // Catalog block — родной каталог верстальщика satin как package-блок
  // (packages/theme-satin/blocks/Catalog/Catalog.astro), порт по образцу rose.
  // assembleFromPackages копирует его + siblings плоско в src/components/,
  // client <script is:inline> гидрирует живой /api/store/products. Превью
  // конструктора рендерит ТОТ ЖЕ файл через Container API (live ≡ превью).
  // Старый CatalogIslandSection.astro (React island) больше не используется.
  Catalog: packageComponent("Catalog", "Catalog"),
};
