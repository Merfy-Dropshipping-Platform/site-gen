#!/usr/bin/env tsx
/**
 * Generate initial preset JSON files for 5 themes from existing data:
 *   - tokens: copied from packages/theme-<id>/tokens.json
 *   - content: sensible Puck defaults (Header + Hero + Collections + PopularProducts + Newsletter + Footer)
 *   - fontsPreload: parsed from tokens.json font.*
 *
 * Output: seed/theme-presets/<id>.json (committed)
 *
 * Developer will refine these through the constructor in Phase 2e UI work.
 * These seeds give tenants a working "select theme → get content" experience
 * from day one.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKAGES_ROOT = resolve(process.cwd(), 'packages');
const OUT_DIR = resolve(process.cwd(), 'seed/theme-presets');

interface ThemeMeta {
  id: string;
  name: string;
  slug: string;
  description: string;
  templateId: string;
  tags: string[];
  badge?: string;
}

const THEMES: ThemeMeta[] = [
  {
    id: 'rose',
    name: 'Rose',
    slug: 'rose',
    description: 'Элегантная тема с розовыми акцентами и коллажной главной.',
    templateId: 'rose-1.0',
    tags: ['flowers', 'beauty', 'pink', 'elegant'],
    badge: 'popular',
  },
  {
    id: 'vanilla',
    name: 'Vanilla',
    slug: 'vanilla',
    description: 'Оливковая минимальная тема, плоские формы, акцент на типографике.',
    templateId: 'vanilla-1.0',
    tags: ['minimal', 'olive', 'flat', 'modern'],
  },
  {
    id: 'satin',
    name: 'Satin',
    slug: 'satin',
    description: 'Монохромная b/w тема с Kelly Slab, плоскими радиусами.',
    templateId: 'satin-1.0',
    tags: ['monochrome', 'editorial', 'bold'],
  },
  {
    id: 'bloom',
    name: 'Bloom',
    slug: 'bloom',
    description: 'Пастельная тема с розовыми акцентами и пилюльными кнопками.',
    templateId: 'bloom-1.0',
    tags: ['pastel', 'pink', 'playful', 'rounded'],
    badge: 'new',
  },
  {
    id: 'flux',
    name: 'Flux',
    slug: 'flux',
    description: 'Тёмная техно-тема с оранжевым акцентом и Roboto Flex.',
    templateId: 'flux-1.0',
    tags: ['dark', 'tech', 'orange', 'modern'],
  },
];

function readTokens(themeId: string): Record<string, unknown> {
  const path = resolve(PACKAGES_ROOT, `theme-${themeId}/tokens.json`);
  if (!existsSync(path)) {
    console.warn(`   ⚠ ${path} not found — empty tokens`);
    return {};
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Convert W3C Design Tokens (packages/theme-<id>/tokens.json shape) to the
 * constructor ThemeSettings shape expected by `buildTokensCss`.
 *
 * W3C:                          ThemeSettings:
 *   radius.button.$value = 8px    buttonRadius: 8    (number, px)
 *   font.heading.$value = "'Bitter', serif"  →  headingFont: "Bitter" (key)
 *
 * Fields not in W3C → omit; buildTokensCss falls back to manifest defaults.
 */
function w3cTokensToThemeSettings(tokens: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pxValue = (group: string, key: string): number | undefined => {
    const g = tokens[group] as Record<string, { $value?: string }> | undefined;
    const raw = g?.[key]?.$value;
    if (typeof raw !== 'string') return undefined;
    const m = raw.match(/^(\d+(?:\.\d+)?)px$/);
    return m ? parseFloat(m[1]) : undefined;
  };
  const fontName = (key: string): string | undefined => {
    const g = tokens.font as Record<string, { $value?: string }> | undefined;
    const raw = g?.[key]?.$value;
    if (typeof raw !== 'string') return undefined;
    const m = raw.match(/^['"]([^'"]+)['"]/);
    return m ? m[1] : undefined;
  };

  const buttonR = pxValue('radius', 'button');
  if (buttonR !== undefined) out.buttonRadius = buttonR;
  const cardR = pxValue('radius', 'card');
  if (cardR !== undefined) out.cardRadius = cardR;
  const inputR = pxValue('radius', 'input');
  if (inputR !== undefined) out.inputRadius = inputR;
  const mediaR = pxValue('radius', 'media');
  if (mediaR !== undefined) out.mediaRadius = mediaR;
  const fieldR = pxValue('radius', 'field');
  if (fieldR !== undefined) out.fieldRadius = fieldR;
  const headingF = fontName('heading');
  if (headingF) out.headingFont = headingF;
  const bodyF = fontName('body');
  if (bodyF) out.bodyFont = bodyF;
  const sectionY = pxValue('spacing', 'section-y');
  if (sectionY !== undefined) out.sectionPadding = sectionY;

  // Color schemes: derive a single default scheme from color.bg / color.heading /
  // color.text / color.button-*. This gives `buildTokensCss` enough to emit a
  // non-empty `.color-scheme-1` block. Full scheme-N variants live in the theme
  // manifest and fill in automatically.
  const colorGroup = tokens.color as Record<string, { $value?: string }> | undefined;
  if (colorGroup) {
    const hex = (k: string): string | undefined =>
      typeof colorGroup[k]?.$value === 'string' ? colorGroup[k].$value : undefined;
    const scheme1: Record<string, unknown> = { id: '1', name: 'Default' };
    const bg = hex('bg'); if (bg) scheme1.background = bg;
    const surface = hex('surface'); if (surface) scheme1.surfaceBg = surface;
    const heading = hex('heading'); if (heading) scheme1.heading = heading;
    const text = hex('text'); if (text) scheme1.text = text;
    const primaryBg = hex('button-bg');
    const primaryText = hex('button-text');
    const primaryBorder = hex('button-border');
    if (primaryBg || primaryText || primaryBorder) {
      scheme1.primaryButton = {
        ...(primaryBg ? { background: primaryBg } : {}),
        ...(primaryText ? { text: primaryText } : {}),
        ...(primaryBorder ? { border: primaryBorder } : {}),
      };
    }
    const secondaryBg = hex('button-2-bg');
    const secondaryText = hex('button-2-text');
    const secondaryBorder = hex('button-2-border');
    if (secondaryBg || secondaryText || secondaryBorder) {
      scheme1.secondaryButton = {
        ...(secondaryBg ? { background: secondaryBg } : {}),
        ...(secondaryText ? { text: secondaryText } : {}),
        ...(secondaryBorder ? { border: secondaryBorder } : {}),
      };
    }
    out.colorSchemes = [scheme1];
    out.defaultSchemeIndex = 0;
  }

  return out;
}

function extractFonts(tokens: Record<string, unknown>): string[] {
  const fonts: string[] = [];
  const fontGroup = tokens.font as Record<string, { $value?: string } | undefined> | undefined;
  if (!fontGroup) return [];
  for (const v of Object.values(fontGroup)) {
    const val = v?.$value;
    if (typeof val !== 'string') continue;
    // "'Bitter', serif" → "Bitter"
    const m = val.match(/^['"]([^'"]+)['"]/);
    if (m && !fonts.includes(m[1])) fonts.push(m[1]);
  }
  return fonts;
}

function buildDefaultContent(themeId: string, name: string) {
  // Puck JSON root shape. Blocks use sensible defaults from
  // packages/theme-base/blocks/<Block>/<Block>.puckConfig.ts (defaults field).
  // Variants picked to showcase the theme's aesthetic.
  const heroVariant = themeId === 'rose' ? 'grid-4' : themeId === 'vanilla' ? 'split' : 'centered';
  return {
    root: { props: {} },
    content: [
      {
        type: 'Header',
        props: {
          id: `header-${themeId}`,
          siteTitle: name,
          logo: '',
          logoPosition: 'top-left',
          stickiness: 'scroll-up',
          menuType: 'dropdown',
          navigationLinks: [
            { label: 'Магазин', href: '/catalog' },
            { label: 'О нас', href: '/about' },
            { label: 'Контакты', href: '/contacts' },
          ],
          actionButtons: { showSearch: true, showCart: true, showProfile: true },
          colorScheme: 1,
          menuColorScheme: 1,
          padding: { top: 16, bottom: 16 },
        },
      },
      {
        type: 'Hero',
        props: {
          id: `hero-${themeId}`,
          title: `Добро пожаловать в ${name}`,
          subtitle: 'Новая коллекция уже в магазине',
          image: { url: '', alt: '' },
          images:
            heroVariant === 'grid-4'
              ? [
                  { url: '', alt: 'Изображение 1' },
                  { url: '', alt: 'Изображение 2' },
                  { url: '', alt: 'Изображение 3' },
                  { url: '', alt: 'Изображение 4' },
                ]
              : undefined,
          cta: { text: 'Смотреть каталог', href: '/catalog' },
          variant: heroVariant,
          colorScheme: 1,
          padding: { top: 80, bottom: 80 },
        },
      },
      {
        type: 'Collections',
        props: {
          id: `collections-${themeId}`,
          heading: 'Коллекции',
          collections: [
            { id: 'col-1', collectionId: null, heading: 'Коллекция 1', description: '' },
            { id: 'col-2', collectionId: null, heading: 'Коллекция 2', description: '' },
            { id: 'col-3', collectionId: null, heading: 'Коллекция 3', description: '' },
          ],
          columns: 3,
          colorScheme: 1,
          padding: { top: 80, bottom: 80 },
        },
      },
      {
        type: 'PopularProducts',
        props: {
          id: `popular-${themeId}`,
          dataSource: 'auto',
          collection: '',
          cards: 4,
          heading: { text: 'Популярное', size: 'medium', alignment: 'center' },
          text: { content: '', size: 'small' },
          productCard: {
            buttonStyle: 'primary',
            cardStyle: 'auto',
            nextPhoto: 'false',
            quickAdd: 'true',
            columns: 4,
            buttonText: 'В корзину',
          },
          colorScheme: 1,
          containerColorScheme: 1,
          padding: { top: 80, bottom: 80 },
        },
      },
      {
        type: 'Footer',
        props: {
          id: `footer-${themeId}`,
          siteTitle: name,
          copyright: { companyName: name, poweredBy: 'Powered by Merfy', showYear: true },
          newsletter: {
            enabled: true,
            heading: 'Подпишитесь на рассылку',
            description: 'Будьте в курсе новых поступлений и акций',
            placeholder: 'Ваш email',
          },
          heading: { text: '', size: 'small', alignment: 'center' },
          text: { content: '', size: 'small' },
          navigationColumn: {
            title: 'Навигация',
            links: [
              { label: 'Магазин', href: '/catalog' },
              { label: 'О нас', href: '/about' },
              { label: 'Контакты', href: '/contacts' },
            ],
          },
          informationColumn: {
            title: 'Информация',
            links: [
              { label: 'Доставка', href: '/delivery' },
              { label: 'Возврат', href: '/returns' },
              { label: 'Оплата', href: '/payment' },
            ],
          },
          socialColumn: { title: 'Соцсети', email: '', socialLinks: [] },
          colorScheme: 1,
          copyrightColorScheme: 1,
          padding: { top: 80, bottom: 80 },
        },
      },
    ],
    zones: {},
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`📦 Generating ${THEMES.length} seed preset JSONs → ${OUT_DIR}\n`);

  for (const theme of THEMES) {
    const tokens = readTokens(theme.id);
    const fontsPreload = extractFonts(tokens);
    const themeSettings = w3cTokensToThemeSettings(tokens);
    const content = buildDefaultContent(theme.id, theme.name);

    const preset = {
      id: theme.id,
      presetVersion: 1,
      name: theme.name,
      slug: theme.slug,
      description: theme.description,
      templateId: theme.templateId,
      price: 0,
      tags: theme.tags,
      badge: theme.badge,
      author: 'merfy',
      isActive: true,
      themeSettings,
      content,
      fontsPreload,
    };
    // strip undefined fields so output is clean
    const clean = JSON.parse(JSON.stringify(preset));

    const outPath = resolve(OUT_DIR, `${theme.id}.json`);
    writeFileSync(outPath, JSON.stringify(clean, null, 2) + '\n');
    console.log(`   ✓ ${theme.id.padEnd(8)} — settings:${Object.keys(themeSettings).length}  fonts:${fontsPreload.length}  blocks:${content.content.length}`);
  }

  console.log(`\n✅ 5 seed presets generated. Commit & run \`pnpm sites:seed-presets\` to load into DB.`);
}

main();
