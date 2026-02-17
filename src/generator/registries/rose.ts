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
