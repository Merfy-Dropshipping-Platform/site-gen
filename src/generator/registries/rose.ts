/**
 * Rose Theme — Component Registry
 *
 * Maps all 20 Puck component types to their corresponding Astro components.
 *
 * Spec 082 W2 (packages-only invariant):
 *   SOURCE-OF-TRUTH: блоки live в `packages/theme-base/blocks/<X>/<X>.astro`.
 *   `assembleFromPackages` копирует их в isolated build scaffold под
 *   `<scaffold>/src/components/<X>.astro`.
 *
 * Consumption (что записывается в generated `src/pages/index.astro`):
 *   relative path `../components/<X>.astro`. Это работает в isolated build
 *   dir где `npm install` выполняется (нет pnpm workspace alias context,
 *   нет Vite alias config). «Packages-only» property сохраняется на
 *   SOURCE side (assembler копирует FROM packages/, не FROM
 *   templates/astro/rose/legacy/).
 *
 * История: T12 попыталась прописать workspace alias `@merfy/theme-base/...`
 * напрямую — Vite/Rollup не resolved alias в isolated dir → build failed.
 * T12.5 revert на relative path который assembler уже set up correctly.
 */
import type { ComponentRegistryEntry } from "../page-generator";

/**
 * Build a registry entry that points at a packages-managed block.
 *
 * Returns relative consumption path (`../components/<X>.astro`) — assembler
 * копирует source from `packages/theme-base/blocks/<X>/<X>.astro` в
 * `<scaffold>/src/components/<X>.astro` перед build, так что relative
 * import resolves correctly без workspace/npm/Vite alias wiring.
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

/** All Puck component types → Astro component mappings for Rose theme */
export const roseRegistry: Record<string, ComponentRegistryEntry> = {
  Header: packageComponent("Header", "Header"),
  Hero: packageComponent("Hero", "Hero"),
  Footer: packageComponent("Footer", "Footer"),
  MainText: packageComponent("MainText", "MainText"),
  PopularProducts: packageComponent("PopularProducts", "PopularProducts"),
  Collections: packageComponent("Collections", "Collections"),
  ContactForm: packageComponent("ContactForm", "ContactForm"),
  Gallery: packageComponent("Gallery", "Gallery"),
  PromoBanner: packageComponent("PromoBanner", "PromoBanner"),
  ImageWithText: packageComponent("ImageWithText", "ImageWithText"),
  Newsletter: packageComponent("Newsletter", "Newsletter"),
  Video: packageComponent("Video", "Video"),
  Slideshow: packageComponent("Slideshow", "Slideshow"),
  MultiColumns: packageComponent("MultiColumns", "MultiColumns"),
  MultiRows: packageComponent("MultiRows", "MultiRows"),
  CollapsibleSection: packageComponent(
    "CollapsibleSection",
    "CollapsibleSection",
  ),
  Publications: packageComponent("Publications", "Publications"),
  Product: packageComponent("Product", "Product"),
  CartSection: packageComponent("CartSection", "CartSection"),
  CheckoutSection: packageComponent("CheckoutSection", "CheckoutSection"),
  Catalog: packageComponent("Catalog", "Catalog"),
};

/**
 * Rose registry variant with PopularProducts replaced by a server-island stub.
 * Used when site.islandsEnabled = true — product data is fetched at runtime
 * via the <merfy-island> Web Component instead of being baked at build time.
 */
export const roseServerRegistry: Record<string, ComponentRegistryEntry> = {
  ...roseRegistry,
  PopularProducts: {
    name: "PopularProducts",
    kind: "server-island",
    importPath: "",
    fallbackHtml: `<section class="py-12 px-4"><h2 class="text-2xl font-bold mb-6 bg-gray-100 rounded h-8 w-48 animate-pulse"></h2><div class="grid grid-cols-2 md:grid-cols-4 gap-4">${Array(4).fill('<div class="space-y-3"><div class="aspect-[318/515] bg-gray-100 rounded-lg animate-pulse"></div><div class="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div><div class="h-4 bg-gray-100 rounded w-1/2 animate-pulse"></div></div>').join("")}</div></section>`,
  },
};
