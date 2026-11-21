// «Дизайн по ссылке» (21.11): форматы проверяющего процесса. Копия раздела 1 контракта
// (`reports/vizi-design-copy/contract.md`): имена полей одинаковые во всех репозиториях, менять только через контракт.
// Имя инструмента, версия и сырой ответ агенту и мерчанту не отдаются: они живут только в `design_looks` и в отчёте стенда.

export type Px = number | null;

export interface Band {
  bg: string;
  fg: string;
  heading: string;
  primary: string;
  primaryFg: string;
  secondary: string | null;
  secondaryFg: string | null;
  // Доля высоты страницы 0..1 и верх полосы в px.
  area: number;
  top: number;
  dark: boolean;
}

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'script';
export type FontSource = 'google' | 'custom' | 'system' | 'unknown';

export interface Font {
  family: string;
  category: FontCategory;
  weight: number;
  cyrillic: boolean | null;
  source: FontSource;
}

export type TypeRole = 'h1' | 'h2' | 'h3' | 'body' | 'small';
export type ButtonLook = 'filled' | 'outline' | 'text';
export type CardLook = 'flat' | 'raised';
export type Align = 'left' | 'center' | 'right';

export interface SiteStyle {
  v: 1;
  url: string;
  finalUrl: string;
  title: string;
  // Сверху вниз; цвета #rrggbb строчными.
  bands: Band[];
  fonts: { heading: Font; body: Font };
  typeScale: { role: TypeRole; px: number }[];
  radius: { button: Px; card: Px; input: Px; media: Px };
  border: { card: Px };
  button: { look: ButtonLook };
  card: { look: CardLook; align: Align };
  spacing: { sectionGap: Px; card: Px };
  shadows: boolean;
  widthPage: Px;
  motion: boolean;
  // Ключ — путь поля ("radius.button"), 0..1. Поля, которых ни один инструмент не снял, — 0.
  confidence: Record<string, number>;
}

export const ROLES = [
  'header',
  'footer',
  'announcement',
  'hero',
  'slider',
  'product-grid',
  'collection-tiles',
  'image-text',
  'text',
  'features',
  'gallery',
  'video',
  'faq',
  'newsletter',
  'contact-form',
  'blog',
  'reviews',
  'brands',
  'instagram',
  'map',
  'countdown',
  'service',
] as const;
export type Role = (typeof ROLES)[number];

export type Layout = 'image-left' | 'image-right' | 'centered' | 'grid' | 'unknown';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Block {
  role: Role;
  confidence: number;
  box: Box;
  // ≤120 знаков, только для разбора — в магазин не идёт.
  heading: string | null;
  cards: number;
  images: number;
  form: boolean;
  video: boolean;
  slides: number;
  layout: Layout;
  columns: number;
  band: number;
}

export interface PageOutline {
  v: 1;
  // Сверху вниз.
  blocks: Block[];
}

export interface OwnItem {
  heading: string | null;
  text: string | null;
  image: string | null;
}

export interface OwnBlock {
  // Номер блока в PageOutline.blocks.
  index: number;
  heading: string | null;
  text: string | null;
  buttons: string[];
  items: OwnItem[];
  // Абсолютные https, крупный вариант.
  images: string[];
}

// Только при `owned: true`: мерчант подтвердил, что сайт его.
export interface OwnContent {
  v: 1;
  logo: string | null;
  menu: { label: string; href: string }[];
  blocks: OwnBlock[];
}

export const DESIGN_ERROR_CODES = [
  'blocked',
  'unreachable',
  'bot-protection',
  'canvas',
  'timeout',
  'tool-failed',
  'invalid',
] as const;
export type DesignErrorCode = (typeof DESIGN_ERROR_CODES)[number];

export interface DesignSnapshot {
  v: 1;
  ok: true;
  tool: string;
  toolVersion: string;
  outlineTool: string;
  ms: number;
  style: SiteStyle;
  outline: PageOutline;
  content: OwnContent | null;
  // ≤512 КБ, по инструменту.
  raw: Record<string, unknown>;
}

export interface DesignFailure {
  v: 1;
  ok: false;
  error: { code: DesignErrorCode; message: string };
}

export type DesignReply = DesignSnapshot | DesignFailure;

// Отказ с кодом контракта: его бросают захват и инструменты, ловит задание и делает ответом.
export class DesignError extends Error {
  constructor(
    readonly code: DesignErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DesignError';
  }
}

export const designFailure = (code: DesignErrorCode, message: string): DesignFailure => ({
  v: 1,
  ok: false,
  error: { code, message },
});
