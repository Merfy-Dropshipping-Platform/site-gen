/**
 * Vanilla Theme — Component Registry
 *
 * Maps all 21 Puck component types to their corresponding Astro components.
 *
 * Spec 084 Stage 1 (vanilla pilot, packages-only invariant):
 *   SOURCE-OF-TRUTH: блоки live в `packages/theme-base/blocks/<X>/<X>.astro`.
 *   `assembleFromPackages` копирует их в isolated build scaffold под
 *   `<scaffold>/src/components/<X>.astro`.
 *
 * No-overrides архитектура (§2.2 spec.md):
 *   Vanilla НЕ имеет ни одного override-блока в `packages/theme-vanilla/blocks/`.
 *   Все различия между темами — additive variants в theme-base + конфигурация
 *   через `theme.json blockDefaults` + CSS-vars в `defaults`/`colorSchemes`.
 *
 * История: legacy `staticComponent("X","X.astro")` указывал на
 * `templates/astro/vanilla/components/`, что нарушало packages-only invariant.
 * Этот registry зеркалит `roseRegistry` — все entries через `packageComponent()`.
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

/** All Puck component types → Astro component mappings for Vanilla theme */
export const vanillaRegistry: Record<string, ComponentRegistryEntry> = {
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
 * Vanilla registry variant with PopularProducts replaced by a server-island stub.
 * Used when site.islandsEnabled = true — product data is fetched at runtime
 * via the <merfy-island> Web Component instead of being baked at build time.
 *
 * Fallback HTML использует vanilla CSS-vars (`rgb(var(--color-bg))`,
 * padding 120px) — соответствует vanilla Figma spec.
 */
export const vanillaServerRegistry: Record<string, ComponentRegistryEntry> = {
  ...vanillaRegistry,
  PopularProducts: {
    name: "PopularProducts",
    kind: "server-island",
    importPath: "",
    fallbackHtml: `<section class="w-full" style="background:rgb(var(--color-bg));padding:120px 0"><div class="max-w-[1320px] mx-auto px-4 md:px-6"><div class="grid grid-cols-2 md:grid-cols-4 gap-4">${Array(4).fill('<div class="space-y-4"><div style="aspect-ratio:1/1;background:rgb(var(--color-fg)/0.06)" class="animate-pulse w-full"></div><div class="h-4 w-3/4 animate-pulse" style="background:rgb(var(--color-fg)/0.06)"></div><div class="h-4 w-1/2 animate-pulse" style="background:rgb(var(--color-fg)/0.06)"></div></div>').join("")}</div></div></section>`,
  },
};
