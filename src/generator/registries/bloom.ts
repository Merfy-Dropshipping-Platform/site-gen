/**
 * Bloom Theme — Component Registry
 *
 * Maps all Puck component types to their corresponding Astro components.
 *
 * 089 Bundle 7: aligned to packages-only invariant (mirror vanillaRegistry).
 * SOURCE-OF-TRUTH: блоки live в `packages/theme-base/blocks/<X>/<X>.astro`.
 * `assembleFromPackages` копирует их в isolated build scaffold под
 * `<scaffold>/src/components/<X>.astro`.
 *
 * No-overrides архитектура (FR-031..FR-033 spec 089):
 *   Bloom НЕ имеет ни одного override-блока в `packages/theme-bloom/blocks/`.
 *   Все различия между темами — additive variants в theme-base + конфигурация
 *   через `theme.json blockDefaults` + CSS-vars в `defaults`/`colorSchemes`.
 *
 * История: legacy `staticComponent("X","X.astro")` указывал на
 * `templates/astro/bloom/components/`, что нарушало packages-only invariant.
 * Этот registry зеркалит `vanillaRegistry` — все entries через `packageComponent()`.
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

/** All Puck component types → Astro component mappings for Bloom theme */
export const bloomRegistry: Record<string, ComponentRegistryEntry> = {
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
  // Корзина = две секции (spec 110, баг-репорт 12): «Корзина» (тело) и
  // «Промежуточный итог» (сводка). CartSection остаётся легаси-алиасом для
  // ревизий, которые ещё не прошли migrateCartPage.
  CartSection: packageComponent("CartSection", "CartSection"),
  // «Избранное» — тело страницы /wishlist (та же механика, что корзина:
  // секция живёт только на своей странице, в палитру конструктора не выводится).
  WishlistSection: packageComponent("WishlistSection", "WishlistSection"),
  // «Личный кабинет» (/account/profile) и «Заказы» (/account/orders) — та же
  // механика: секция живёт только на своей странице, в палитру не выводится.
  AccountSection: packageComponent("AccountSection", "AccountSection"),
  OrdersSection: packageComponent("OrdersSection", "OrdersSection"),
  // «Вход» (/login) — та же механика: секция живёт только на своей странице,
  // в палитру не выводится.
  LoginSection: packageComponent("LoginSection", "LoginSection"),
  CartBody: packageComponent("CartBody", "CartBody"),
  CartSummary: packageComponent("CartSummary", "CartSummary"),
  CheckoutSection: packageComponent("CheckoutSection", "CheckoutSection"),
  OrderConfirmation: packageComponent("OrderConfirmation", "OrderConfirmation"),
  Catalog: packageComponent("Catalog", "Catalog"),
  // Bespoke designer section ported into a theme-bloom block (no theme-base
  // equivalent). Render lives in packages/theme-bloom/blocks/Benefits/Benefits.astro.
  Benefits: packageComponent("Benefits", "Benefits"),
};
