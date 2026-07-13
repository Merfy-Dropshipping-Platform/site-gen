import type { BaseBlockEntry } from "../../packages/theme-contract/resolver/resolveBlocks";

/**
 * Canonical, byte-for-byte extraction of the base-block catalog that
 * `ThemePuckConfigController` used to embed inline. Moved here so both the
 * controller (production response) and the conformance source snapshot consume
 * ONE source of truth instead of re-declaring the list (which would let the two
 * drift silently).
 *
 * `THEME_PUCK_BASE_BLOCK_NAMES` preserves the EXACT ordering the controller had
 * (18 content blocks + cart/checkout mega-blocks + Catalog + 7 chrome blocks).
 * The order matters: the multi-theme parity test asserts the controller now
 * consumes this array with no change to its response.
 *
 * `THEME_PUCK_BASE_BLOCKS` is the derived `{ source:'base', path:<name> }`
 * record (same shape the controller built via `.map()`), so the controller can
 * import the finished registry directly.
 */
export const THEME_PUCK_BASE_BLOCK_NAMES: readonly string[] = [
  // 18 content blocks
  "Hero",
  "PromoBanner",
  "PopularProducts",
  "Collections",
  "Gallery",
  "Product",
  "MainText",
  "ImageWithText",
  "Slideshow",
  "MultiColumns",
  "MultiRows",
  "CollapsibleSection",
  "Newsletter",
  "ContactForm",
  "Video",
  "Publications",
  // Page (Страница) — embed-карточка ссылки на другую страницу магазина (Figma 314-35117).
  "Page",
  "CartSection",
  "CheckoutSection",
  // Cart page Puck-driven sections
  "CartBody",
  "CartSummary",
  "CartTotals",
  "CartCheckoutButton",
  // Checkout page mega-blocks (Figma 1:19998 — 2 секции вместо 11)
  "CheckoutForm",
  "CheckoutSummary",
  // Thank-you / order confirmation (Spec 103) — Figma 1:20389/1:20698
  "OrderConfirmation",
  // Catalog page-only block (filter sidebar + product grid + pagination)
  "Catalog",
  // 7 chrome blocks
  "Header",
  "Footer",
  "CheckoutHeader",
  "AuthModal",
  "CartDrawer",
  "CheckoutLayout",
  "AccountLayout",
];

/**
 * Registry of the base blocks shipped by @merfy/theme-base. Paths are the block
 * name (convention: base blocks resolve relative to the controller at runtime).
 * This is the identical shape the controller produced from the inline array.
 */
export const THEME_PUCK_BASE_BLOCKS: Record<string, BaseBlockEntry> =
  Object.fromEntries(
    THEME_PUCK_BASE_BLOCK_NAMES.map((name) => [
      name,
      { source: "base" as const, path: name },
    ]),
  );
