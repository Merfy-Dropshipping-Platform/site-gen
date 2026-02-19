/**
 * Rose Theme — Component Registry
 *
 * Maps all 18 Puck component types to their corresponding Astro components
 * in templates/astro/rose/src/components/.
 *
 * Import paths are relative from src/pages/ to src/components/.
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

/** All Puck component types → Astro component mappings for Rose theme */
export const roseRegistry: Record<string, ComponentRegistryEntry> = {
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
  Product: staticComponent("Product", "Product.astro"),
};

/**
 * Rose registry variant with product components replaced by server-island stubs.
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
  Product: {
    name: "Product",
    kind: "server-island",
    importPath: "",
    fallbackHtml: `<section class="py-12 px-4"><div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-8"><div class="aspect-square bg-gray-100 rounded-lg animate-pulse"></div><div class="space-y-4"><div class="h-8 bg-gray-100 rounded w-3/4 animate-pulse"></div><div class="h-6 bg-gray-100 rounded w-1/4 animate-pulse"></div><div class="h-4 bg-gray-100 rounded w-full animate-pulse"></div><div class="h-4 bg-gray-100 rounded w-5/6 animate-pulse"></div><div class="h-12 bg-gray-100 rounded w-40 animate-pulse mt-4"></div></div></div></section>`,
  },
  Collections: {
    name: "Collections",
    kind: "server-island",
    importPath: "",
    fallbackHtml: `<section class="py-12 px-4"><h2 class="text-2xl font-bold mb-6 bg-gray-100 rounded h-8 w-48 animate-pulse"></h2><div class="grid grid-cols-2 md:grid-cols-3 gap-4">${Array(3).fill('<div class="space-y-3"><div class="aspect-video bg-gray-100 rounded-lg animate-pulse"></div><div class="h-4 bg-gray-100 rounded w-2/3 animate-pulse"></div></div>').join("")}</div></section>`,
  },
};
