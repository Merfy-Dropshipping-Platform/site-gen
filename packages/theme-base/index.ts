// @merfy/theme-base — barrel exports

// Content blocks (Phase 1a)
export * as Hero from './blocks/Hero';
export * as PromoBanner from './blocks/PromoBanner';
export * as PopularProducts from './blocks/PopularProducts';
export * as Collections from './blocks/Collections';
export * as Gallery from './blocks/Gallery';
export * as Product from './blocks/Product';
export * as MainText from './blocks/MainText';
export * as ImageWithText from './blocks/ImageWithText';
export * as Slideshow from './blocks/Slideshow';
export * as MultiColumns from './blocks/MultiColumns';
export * as MultiRows from './blocks/MultiRows';
export * as CollapsibleSection from './blocks/CollapsibleSection';
export * as Newsletter from './blocks/Newsletter';
export * as ContactForm from './blocks/ContactForm';
export * as Video from './blocks/Video';
export * as Publications from './blocks/Publications';
export * as CartSection from './blocks/CartSection';
export * as Catalog from './blocks/Catalog';

// Chrome blocks (Phase 1b)
export * as Header from './blocks/Header';
export * as Footer from './blocks/Footer';
export * as CheckoutHeader from './blocks/CheckoutHeader';
export * as AuthModal from './blocks/AuthModal';
export * as CartDrawer from './blocks/CartDrawer';
export * as CheckoutLayout from './blocks/CheckoutLayout';
export * as AccountLayout from './blocks/AccountLayout';

// Checkout content blocks (Phase 080)
export * as CheckoutSummaryToggle from './blocks/CheckoutSummaryToggle';
export * as CheckoutContactForm from './blocks/CheckoutContactForm';
export * as CheckoutDeliveryForm from './blocks/CheckoutDeliveryForm';
export * as CheckoutDeliveryMethod from './blocks/CheckoutDeliveryMethod';
export * as CheckoutPayment from './blocks/CheckoutPayment';
export * as CheckoutOrderSummary from './blocks/CheckoutOrderSummary';

// SEO TS modules (Phase 1b)
export { buildSitemap } from './seo/SitemapBuilder';
export type { SitemapUrl } from './seo/SitemapBuilder';
export { buildRobots } from './seo/RobotsBuilder';
export type { RobotsConfig } from './seo/RobotsBuilder';
export { buildYandexFeed } from './seo/YandexFeed';
export type { YmlOffer, YmlCategory, YmlShop } from './seo/YandexFeed';
export { extractCriticalCss } from './seo/CoreWebVitals/CriticalCss';
export type { CriticalCssOptions, CriticalCssResult } from './seo/CoreWebVitals/CriticalCss';

// Astro components (BaseLayout, StoreLayout, MetaTags, JsonLd, etc.)
// are imported directly by consumers via their file paths — no TS barrel re-export needed
// since .astro files are not importable as TS modules.
