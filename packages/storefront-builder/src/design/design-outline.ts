import type { DomBlock } from './design-dom';
import type { Band, Block, Box, PageOutline, Role } from './design-types';

// «Контур страницы» из контура DOM (`browser/contour.js`). Блоки — все блоки верхнего уровня сверху вниз, номер блока
// контура совпадает с номером блока DOM (по нему же `OwnContent`). Что выбросить (шапку, подвал, служебное, ниже 80 px)
// и как склеить — решает конвертер merfy-mcp, здесь только роль и признаки.
//
// Роль `dom` — таблица правил по признакам блока: первое совпавшее правило. `designlang` (`tools/designlang.ts`)
// ставит свою роль поверх, где его секция накрывает блок и его уверенность выше.

export interface RoleContext {
  block: DomBlock;
  index: number;
  total: number;
  text: string;
}

type RoleRule = { role: Role; confidence: number; test: (context: RoleContext) => boolean };

const has =
  (pattern: RegExp) =>
  (context: RoleContext): boolean =>
    pattern.test(context.text);
const TAG_HINT =
  (words: RegExp) =>
  (context: RoleContext): boolean =>
    words.test(`${context.block.tag} ${context.block.hint} ${context.block.id}`);

const COOKIE = /cookie|куки|файлы cookie|персональных данных.*соглас/i;
const SUBSCRIBE = /подпис|рассыл|subscribe|newsletter/i;
const FAQ = /вопрос|faq|ответы|частые/i;
const REVIEWS = /отзыв|review|testimonial/i;
const INSTAGRAM = /instagram|инстаграм/i;
const BRANDS = /бренд|brand|партн[её]р|partner/i;
const BLOG = /блог|стать[иья]|новост|журнал|blog|journal|news/i;
const COUNTDOWN = /до конца (акции|распродажи)|таймер|countdown|\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2}/i;
const COLLECTIONS = /коллекци|категори|каталог|collection|categor|shop by/i;

export const ROLE_RULES: RoleRule[] = [
  { role: 'header', confidence: 0.9, test: TAG_HINT(/^(header|nav)\b|header|navbar|t228|t-menu/i) },
  { role: 'header', confidence: 0.6, test: (c) => c.index === 0 && c.block.box.h < 220 && c.block.links >= 3 },
  { role: 'footer', confidence: 0.9, test: TAG_HINT(/^footer\b|footer/i) },
  { role: 'footer', confidence: 0.5, test: (c) => c.index === c.total - 1 && c.block.links >= 5 },
  { role: 'service', confidence: 0.8, test: (c) => c.block.fixed && COOKIE.test(c.text) },
  { role: 'announcement', confidence: 0.6, test: (c) => c.index <= 1 && c.block.box.h < 70 && c.text.length < 160 },
  { role: 'video', confidence: 0.7, test: (c) => c.block.video },
  { role: 'map', confidence: 0.7, test: (c) => c.block.iframeMap },
  { role: 'newsletter', confidence: 0.7, test: (c) => c.block.email && c.block.fields <= 2 && SUBSCRIBE.test(c.text) },
  {
    role: 'contact-form',
    confidence: 0.6,
    test: (c) => c.block.textarea || (c.block.fields >= 3 && c.block.prices === 0),
  },
  { role: 'faq', confidence: 0.7, test: (c) => c.block.details >= 3 || FAQ.test(c.block.heading ?? '') },
  { role: 'slider', confidence: 0.6, test: (c) => c.block.slides >= 2 && c.block.prices < 2 },
  { role: 'reviews', confidence: 0.6, test: (c) => REVIEWS.test(c.block.heading ?? '') },
  { role: 'instagram', confidence: 0.6, test: has(INSTAGRAM) },
  { role: 'brands', confidence: 0.5, test: (c) => BRANDS.test(c.block.heading ?? '') && c.block.images >= 4 },
  { role: 'blog', confidence: 0.5, test: (c) => BLOG.test(c.block.heading ?? '') && c.block.cards >= 2 },
  { role: 'countdown', confidence: 0.5, test: has(COUNTDOWN) },
  { role: 'product-grid', confidence: 0.7, test: (c) => c.block.cards >= 3 && c.block.prices >= 2 },
  {
    role: 'collection-tiles',
    confidence: 0.5,
    test: (c) => c.block.cards >= 2 && COLLECTIONS.test(c.text) && c.block.prices === 0,
  },
  { role: 'features', confidence: 0.5, test: (c) => c.block.cards >= 3 && c.block.images < c.block.cards },
  { role: 'gallery', confidence: 0.4, test: (c) => c.block.cards >= 3 },
  { role: 'hero', confidence: 0.6, test: (c) => c.index <= 2 && c.block.box.h >= 350 && c.block.images >= 1 },
  {
    role: 'image-text',
    confidence: 0.5,
    test: (c) => c.block.layout === 'image-left' || c.block.layout === 'image-right',
  },
  { role: 'gallery', confidence: 0.4, test: (c) => c.block.images >= 4 },
  { role: 'text', confidence: 0.4, test: (c) => c.text.length >= 80 },
];
const FALLBACK: RoleRule = { role: 'text', confidence: 0.2, test: () => true };

export function domRole(context: RoleContext): { role: Role; confidence: number } {
  const rule = ROLE_RULES.find((candidate) => candidate.test(context)) ?? FALLBACK;
  return { role: rule.role, confidence: rule.confidence };
}

// Номер полосы цвета: последняя полоса, чей верх выше середины блока.
export function bandOf(box: Box, bands: Pick<Band, 'top'>[]): number {
  const middle = box.y + box.h / 2;
  const index = bands.reduce((found, band, position) => (band.top <= middle ? position : found), 0);
  return Math.max(0, index);
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const whole = (box: Box): Box => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  w: Math.round(box.w),
  h: Math.round(box.h),
});

export function blockOf(block: DomBlock, role: { role: Role; confidence: number }, bands: Pick<Band, 'top'>[]): Block {
  return {
    role: role.role,
    confidence: round2(role.confidence),
    box: whole(block.box),
    heading: block.heading === null ? null : block.heading.slice(0, 120),
    cards: Math.round(block.cards),
    images: Math.round(block.images),
    form: block.form,
    video: block.video,
    slides: Math.round(block.slides),
    layout: block.layout,
    columns: Math.max(1, Math.round(block.columns)),
    band: bandOf(block.box, bands),
  };
}

export const contextOf = (block: DomBlock, index: number, total: number): RoleContext => ({
  block,
  index,
  total,
  text: `${block.heading ?? ''} ${block.text}`,
});

// Переходник `dom`: роли по таблице правил.
export function domOutline(dom: DomBlock[], bands: Pick<Band, 'top'>[]): PageOutline {
  const blocks = dom.map((block, index) => blockOf(block, domRole(contextOf(block, index, dom.length)), bands));
  return { v: 1, blocks };
}
