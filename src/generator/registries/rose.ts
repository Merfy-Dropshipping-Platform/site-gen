/**
 * Rose Theme — Component Registry
 *
 * Maps all 20 Puck component types to their corresponding Astro components
 * in @merfy/theme-base/blocks/<Block>/<Block>.astro.
 *
 * Spec 082 W2: switched live build for Rose to packages-only path.
 * Previously imports were relative `../components/<X>.astro` pointing at
 * `templates/astro/rose/src/components/`; now they resolve via the
 * pnpm workspace alias to `packages/theme-base/blocks/<X>/<X>.astro`.
 */
import type { ComponentRegistryEntry } from "../page-generator";

/**
 * Build a registry entry that points at a packages-managed block.
 * Used by the new packages-only Rose registry (spec 082 W2).
 */
function packageComponent(
  name: string,
  blockDir: string,
): ComponentRegistryEntry {
  return {
    name,
    kind: "static",
    importPath: `@merfy/theme-base/blocks/${blockDir}/${blockDir}.astro`,
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
