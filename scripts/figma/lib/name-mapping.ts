import type { BlockName } from './types.js';

/**
 * Figma frame label → block name.
 * Keys are lowercase. Longest match wins (so "contact form" beats "form").
 * Both English and Russian labels supported — developers in Merfy design in Russian.
 */
const RAW_MAP: Record<string, BlockName> = {
  // Header / Nav
  header: 'Header',
  шапка: 'Header',
  'top bar': 'Header',
  nav: 'Header',
  'main nav': 'Header',
  'nav bar': 'Header',
  "navbar's": 'Header',
  navbar: 'Header',

  // Footer
  footer: 'Footer',
  подвал: 'Footer',
  'bottom bar': 'Footer',

  // Hero
  hero: 'Hero',
  'главный экран': 'Hero',
  'главный баннер': 'Hero',
  'верхний баннер': 'Hero',
  'первый экран': 'Hero',

  // Promo / Announcement strip
  'панель объявлений': 'PromoBanner',
  'промо баннер': 'PromoBanner',
  'promo banner': 'PromoBanner',
  announcement: 'PromoBanner',
  announcements: 'PromoBanner',
  'announcement bar': 'PromoBanner',
  promo: 'PromoBanner',
  'promo strip': 'PromoBanner',

  // Product
  товар: 'Product',
  product: 'Product',
  'product page': 'Product',
  'product detail': 'Product',
  'страница товара': 'Product',

  // Collections
  'коллекция товаров': 'Collections',
  коллекции: 'Collections',
  collections: 'Collections',
  collection: 'Collections',
  'collection grid': 'Collections',
  'collection list': 'Collections',

  // Popular products
  'popular products': 'PopularProducts',
  'популярные товары': 'PopularProducts',
  'featured products': 'PopularProducts',
  'рекомендуемые товары': 'PopularProducts',
  'product list': 'PopularProducts',

  // Image / Media with text
  изображение: 'ImageWithText',
  'image with text': 'ImageWithText',
  'image + text': 'ImageWithText',
  'image text': 'ImageWithText',
  'media text': 'ImageWithText',

  // Newsletter
  newsletter: 'Newsletter',
  подписка: 'Newsletter',
  'email signup': 'Newsletter',
  'рассылка': 'Newsletter',

  // Gallery
  gallery: 'Gallery',
  галерея: 'Gallery',
  'image gallery': 'Gallery',
  'photo grid': 'Gallery',
  'фото товаров': 'Gallery',

  // Video
  video: 'Video',
  видео: 'Video',

  // Slideshow / Carousel
  slideshow: 'Slideshow',
  слайдшоу: 'Slideshow',
  слайдер: 'Slideshow',
  carousel: 'Slideshow',
  slider: 'Slideshow',

  // Multi-column / Multi-row
  'multi columns': 'MultiColumns',
  'multi-columns': 'MultiColumns',
  columns: 'MultiColumns',
  колонки: 'MultiColumns',
  'multi rows': 'MultiRows',
  'multi-rows': 'MultiRows',
  rows: 'MultiRows',
  строки: 'MultiRows',

  // Main text
  'main text': 'MainText',
  'текстовый блок': 'MainText',
  'rich text': 'MainText',
  text: 'MainText',
  текст: 'MainText',

  // Contact form
  'contact form': 'ContactForm',
  'форма обратной связи': 'ContactForm',
  'feedback form': 'ContactForm',
  'форма контактов': 'ContactForm',

  // Collapsible
  'collapsible section': 'CollapsibleSection',
  'сворачиваемая секция': 'CollapsibleSection',
  spoiler: 'CollapsibleSection',
  faq: 'CollapsibleSection',
  accordion: 'CollapsibleSection',

  // Publications / Blog
  publications: 'Publications',
  публикации: 'Publications',
  'blog posts': 'Publications',
  blog: 'Publications',
  news: 'Publications',
  новости: 'Publications',

  // Chrome (usually not rendered in Figma but possible)
  cart: 'CartDrawer',
  корзина: 'CartDrawer',
  'cart drawer': 'CartDrawer',
  'cart sidebar': 'CartDrawer',
  checkout: 'CheckoutSection',
  оформление: 'CheckoutSection',
  'оформление заказа': 'CheckoutSection',
  'checkout page': 'CheckoutLayout',
  'checkout header': 'CheckoutHeader',
  login: 'AuthModal',
  авторизация: 'AuthModal',
  регистрация: 'AuthModal',
  'sign in': 'AuthModal',
  'sign up': 'AuthModal',
  account: 'AccountLayout',
  'личный кабинет': 'AccountLayout',
  'my account': 'AccountLayout',
  profile: 'AccountLayout',
};

/** Pre-build sorted entries: longer keys first (longest-match wins). */
const SORTED_ENTRIES = Object.entries(RAW_MAP).sort((a, b) => b[0].length - a[0].length);

/**
 * Attempt to resolve a Figma frame name to a block name.
 * Returns null if no match found.
 */
export function matchBlockName(rawName: string): BlockName | null {
  const name = normalize(rawName);

  // Exact match first (higher priority)
  const exact = RAW_MAP[name];
  if (exact) return exact;

  // Substring match (longest key that appears in the name)
  for (const [key, block] of SORTED_ENTRIES) {
    if (name.includes(key)) return block;
  }
  return null;
}

/**
 * Tells us about ALL matches (for debugging / multiple-matches detection).
 */
export function allMatches(rawName: string): BlockName[] {
  const name = normalize(rawName);
  const hits = new Set<BlockName>();
  for (const [key, block] of SORTED_ENTRIES) {
    if (name.includes(key)) hits.add(block);
  }
  return [...hits];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_/|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
