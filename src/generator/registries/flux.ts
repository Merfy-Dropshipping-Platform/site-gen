/**
 * Flux Theme — Component Registry
 *
 * Mirror bloom/rose/vanilla — packages-only invariant. Source-of-truth blocks
 * live in `packages/theme-base/blocks/<X>/<X>.astro`. `assembleFromPackages`
 * copies them into scaffold dir under `<scaffold>/src/components/<X>.astro`.
 *
 * Все различия flux от других тем — через CSS-vars в theme.json `defaults`/
 * `colorSchemes` + блок-defaults в `blockDefaults`. Никаких override-блоков
 * в `packages/theme-flux/blocks/`.
 */
import type { ComponentRegistryEntry } from "../page-generator";

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

export const fluxRegistry: Record<string, ComponentRegistryEntry> = {
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
  Page: packageComponent("Page", "Page"),
  Product: packageComponent("Product", "Product"),
  CartSection: packageComponent("CartSection", "CartSection"),
  CheckoutSection: packageComponent("CheckoutSection", "CheckoutSection"),
  OrderConfirmation: packageComponent("OrderConfirmation", "OrderConfirmation"),
  Catalog: packageComponent("Catalog", "Catalog"),
};
