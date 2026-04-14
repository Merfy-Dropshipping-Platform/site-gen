/**
 * Vanilla Theme — Component Registry
 *
 * Maps all 20 Puck component types to their corresponding Astro components
 * in templates/astro/vanilla/src/components/.
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

/** All Puck component types → Astro component mappings for Vanilla theme */
export const vanillaRegistry: Record<string, ComponentRegistryEntry> = {
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
  CartSection: staticComponent("CartSection", "CartSection.astro"),
  CheckoutSection: staticComponent("CheckoutSection", "CheckoutSection.astro"),
};

/**
 * Vanilla registry variant with PopularProducts replaced by a server-island stub.
 * Used when site.islandsEnabled = true.
 */
export const vanillaServerRegistry: Record<string, ComponentRegistryEntry> = {
  ...vanillaRegistry,
  PopularProducts: {
    name: "PopularProducts",
    kind: "server-island",
    importPath: "",
    fallbackHtml: `<section class="w-full" style="background:rgb(var(--color-background));padding:120px 0"><div class="max-w-[1320px] mx-auto px-4 md:px-6"><div class="grid grid-cols-2 md:grid-cols-4 gap-4">${Array(4).fill('<div class="space-y-4"><div style="aspect-ratio:1/1;background:rgb(var(--color-foreground)/0.06)" class="animate-pulse w-full"></div><div class="h-4 w-3/4 animate-pulse" style="background:rgb(var(--color-foreground)/0.06)"></div><div class="h-4 w-1/2 animate-pulse" style="background:rgb(var(--color-foreground)/0.06)"></div></div>').join("")}</div></div></section>`,
  },
};
