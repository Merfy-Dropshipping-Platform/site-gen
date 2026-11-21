import { fileURLToPath } from 'node:url';
import { runNode, tabRun } from '../design-node';
import type { DomBlock } from '../design-dom';
import { blockOf, contextOf, domRole } from '../design-outline';
import { at, list, numberOf, record, text } from '../design-pick';
import { buildPart, type PartBand, type StylePart, type StyleTable, type StyleValues } from '../design-style';
import type { Box, ButtonLook, CardLook, PageOutline, Role } from '../design-types';
import { hexColor, opaqueHex, px, radius, visibleShadow } from '../design-values';
import { partFont } from './shared';
import { TAB_ORDER, pinned, type OutlineTool, type StyleTool, type ToolFacts } from './tool';

// Переходник designlang (MIT): наш `node/designlang.mjs` — `extractDesignLanguage` по уже открытой захватом вкладке
// (`node/borrow.mjs`, их src/crawler.js); `--smart` (модель) не включаем. Один ответ годится и для стиля, и для
// контура: в задании Node запускается один раз (`design-run.ts` кэширует сырой ответ).
//
// Цвета: `colors.dominance` — фоны с долей площади (порядка сверху вниз нет: полосы по площади, верх 0),
// `colors.pairs` — текст на фоне, `components.buttons.variants` — кнопки. Контур: их `sectionRoles` (роли английскими
// словами, на русских сайтах слабее) ставятся поверх ролей DOM там, где их секция накрывает блок и уверенность выше.

const MIN_SHARE = 0.02;
const WIDTH_RANGE: [number, number] = [600, 1360];
// Доля блока, которую секция должна накрыть, чтобы её роль считалась ролью блока.
const OVERLAP = 0.6;

// Их роль секции → наша роль и во сколько раз доверять их уверенности. На магазинах `pricing-table` — сетка товаров.
export const ROLE_MAP: Record<string, [Role, number]> = {
  nav: ['header', 1],
  header: ['header', 1],
  footer: ['footer', 1],
  hero: ['hero', 1],
  'feature-grid': ['features', 0.9],
  features: ['features', 0.9],
  bento: ['features', 0.6],
  steps: ['features', 0.5],
  'pricing-table': ['product-grid', 0.6],
  pricing: ['product-grid', 0.6],
  testimonial: ['reviews', 1],
  testimonials: ['reviews', 1],
  'logo-wall': ['brands', 1],
  faq: ['faq', 1],
  gallery: ['gallery', 0.8],
  cta: ['image-text', 0.5],
  'blog-grid': ['blog', 1],
  stats: ['text', 0.5],
  comparison: ['text', 0.4],
  content: ['text', 0.6],
};

type Raw = Record<string, unknown>;

function family(raw: Raw, usages: string[][]): unknown {
  const all = list(at(raw, 'typography', 'families'));
  const byCount = (a: unknown, b: unknown): number => (numberOf(at(b, 'count')) ?? 0) - (numberOf(at(a, 'count')) ?? 0);
  const picks = usages.map(
    (group) => all.filter((entry) => group.includes(String(at(entry, 'usage')))).sort(byCount)[0],
  );
  return picks.find((pick) => pick !== undefined);
}

const font = (usages: string[][], sample: (raw: Raw) => unknown, google: ReadonlySet<string>) => (raw: Raw) => {
  const name = text(at(family(raw, usages), 'name'));
  return name === null ? null : partFont(name, at(sample(raw), 'weight'), null, google);
};

function typeScale(raw: Raw): StyleValues['typeScale'] {
  const scale = list(at(raw, 'typography', 'roleScale'));
  const heads = (['h1', 'h2', 'h3'] as const).flatMap((role) => {
    const size = numberOf(
      at(
        scale.find((entry) => at(entry, 'role') === role),
        'size',
      ),
    );
    return size === null ? [] : [{ role, px: Math.round(size) }];
  });
  const body = px(at(raw, 'typography', 'body', 'size'));
  return body === null ? heads : [...heads, { role: 'body', px: Math.round(body) }];
}

const variants = (raw: Raw): unknown[] => list(at(raw, 'components', 'buttons', 'variants'));
const filledVariants = (raw: Raw): unknown[] =>
  variants(raw).filter((entry) => opaqueHex(at(entry, 'backgroundColor')) !== null);

function bands(raw: Raw): PartBand[] {
  const pairs = new Map(
    list(at(raw, 'colors', 'pairs')).map((pair) => [opaqueHex(at(pair, 'background')), at(pair, 'foreground')]),
  );
  const found = list(at(raw, 'colors', 'dominance')).flatMap((entry) => {
    const bg = opaqueHex(at(entry, 'hex'));
    const share = numberOf(at(entry, 'areaShare')) ?? 0;
    return bg === null || share < MIN_SHARE ? [] : [{ bg, share }];
  });
  const total = found.reduce((sum, entry) => sum + entry.share, 0) || 1;
  const [first, second] = filledVariants(raw);
  const button = (entry: unknown) => [opaqueHex(at(entry, 'backgroundColor')), hexColor(at(entry, 'style', 'color'))];
  const [primary, primaryFg] = button(first);
  const [secondary, secondaryFg] = button(second);
  return found.map((entry, index) => ({
    bg: entry.bg,
    fg: hexColor(pairs.get(entry.bg), entry.bg),
    ...(index === 0 ? { primary, primaryFg, secondary, secondaryFg } : {}),
    area: Math.round((entry.share / total) * 1000) / 1000,
    top: 0,
  }));
}

const componentRadius = (kind: string) => (raw: Raw) =>
  numberOf(at(raw, 'components', kind, 'count'))
    ? radius(at(raw, 'components', kind, 'baseStyle', 'borderRadius'))
    : null;

function buttonLook(raw: Raw): ButtonLook | null {
  const all = variants(raw);
  if (all.length === 0) return null;
  const looks: Array<[boolean, ButtonLook]> = [
    [filledVariants(raw).length > 0, 'filled'],
    [all.some((entry) => at(entry, 'variant') === 'outline'), 'outline'],
  ];
  return looks.find(([hit]) => hit)?.[1] ?? 'text';
}

function cardLook(raw: Raw): CardLook | null {
  if (!numberOf(at(raw, 'components', 'cards', 'count'))) return null;
  const base = record(at(raw, 'components', 'cards', 'baseStyle'));
  return opaqueHex(base.backgroundColor) !== null || visibleShadow(base.boxShadow) ? 'raised' : 'flat';
}

function widthPage(raw: Raw): number | null {
  const [low, high] = WIDTH_RANGE;
  const widths = list(at(raw, 'layout', 'containerWidths')).map((entry) => px(at(entry, 'maxWidth')));
  const found = widths.find((width) => width !== null && width >= low && width <= high);
  return found === undefined || found === null ? null : Math.round(found);
}

function table(google: ReadonlySet<string>): StyleTable<Raw> {
  return {
    bands: { take: bands, confidence: 0.5 },
    'fonts.heading': {
      take: font([['headings'], ['all']], (raw) => list(at(raw, 'typography', 'headings'))[0], google),
      confidence: 0.7,
    },
    'fonts.body': { take: font([['body', 'all']], (raw) => at(raw, 'typography', 'body'), google), confidence: 0.8 },
    typeScale: { take: typeScale, confidence: 0.7 },
    'radius.button': { take: (raw) => radius(at(filledVariants(raw)[0], 'style', 'borderRadius')), confidence: 0.6 },
    'radius.card': { take: componentRadius('cards'), confidence: 0.5 },
    'radius.input': { take: componentRadius('inputs'), confidence: 0.5 },
    'button.look': { take: buttonLook, confidence: 0.6 },
    'card.look': { take: cardLook, confidence: 0.5 },
    shadows: {
      take: (raw) => list(at(raw, 'shadows', 'values')).some((entry) => visibleShadow(at(entry, 'raw'))),
      confidence: 0.6,
    },
    widthPage: { take: widthPage, confidence: 0.5 },
    motion: { take: (raw) => list(at(raw, 'animations', 'keyframes')).length > 0, confidence: 0.3 },
  };
}

export const designlangStyle = (raw: unknown, facts: Pick<ToolFacts, 'google'>): StylePart =>
  buildPart(record(raw), table(facts.google));

interface Section {
  box: Box;
  role: Role;
  confidence: number;
}

const boxOf = (raw: unknown): Box => ({
  x: numberOf(at(raw, 'x')) ?? 0,
  y: numberOf(at(raw, 'y')) ?? 0,
  w: numberOf(at(raw, 'w')) ?? 0,
  h: numberOf(at(raw, 'h')) ?? 0,
});

function sectionsOf(raw: unknown): Section[] {
  return list(at(raw, 'sectionRoles', 'sections')).flatMap((entry) => {
    const mapped = ROLE_MAP[String(at(entry, 'role'))];
    const box = boxOf(at(entry, 'bounds'));
    if (mapped === undefined || box.w <= 0 || box.h <= 0) return [];
    return [{ box, role: mapped[0], confidence: (numberOf(at(entry, 'confidence')) ?? 0) * mapped[1] }];
  });
}

// Какая доля блока накрыта секцией.
export function covered(block: Box, section: Box): number {
  const w = Math.min(block.x + block.w, section.x + section.w) - Math.max(block.x, section.x);
  const h = Math.min(block.y + block.h, section.y + section.h) - Math.max(block.y, section.y);
  return w <= 0 || h <= 0 || block.w * block.h === 0 ? 0 : (w * h) / (block.w * block.h);
}

// Самая уверенная секция, накрывающая блок; её роль — если она увереннее правила DOM.
function roleFor(
  block: DomBlock,
  index: number,
  total: number,
  sections: Section[],
): { role: Role; confidence: number } {
  const own = domRole(contextOf(block, index, total));
  const over = sections
    .filter((section) => covered(block.box, section.box) >= OVERLAP)
    .sort((a, b) => b.confidence - a.confidence)[0];
  return over !== undefined && over.confidence > own.confidence
    ? { role: over.role, confidence: over.confidence }
    : own;
}

export function designlangOutline(raw: unknown, facts: Pick<ToolFacts, 'dom' | 'bands'>): PageOutline {
  const sections = sectionsOf(raw);
  const blocks = facts.dom.map((block, index) =>
    blockOf(block, roleFor(block, index, facts.dom.length, sections), facts.bands),
  );
  return { v: 1, blocks };
}

const SCRIPT = fileURLToPath(new URL('../node/designlang.mjs', import.meta.url));

const raw: StyleTool['raw'] = ({ captured, budgetMs }) => runNode(tabRun(SCRIPT, captured, budgetMs));

export const designlang: StyleTool & OutlineTool = {
  name: 'designlang',
  version: pinned('designlang'),
  // Только читает стили страницы — идёт до dembrandt. На вкладке захвата
  // (стенд 21.11): 1–4 с на магазинах, 12 с на tilda.cc; раньше со своей загрузкой — 12–17 с.
  order: TAB_ORDER.reads,
  limitMs: 15_000,
  raw,
  style: designlangStyle,
  outline: designlangOutline,
};
