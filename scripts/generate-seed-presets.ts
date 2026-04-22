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
      tokens,
      content,
      fontsPreload,
    };
    // strip undefined fields so output is clean
    const clean = JSON.parse(JSON.stringify(preset));

    const outPath = resolve(OUT_DIR, `${theme.id}.json`);
    writeFileSync(outPath, JSON.stringify(clean, null, 2) + '\n');
    console.log(`   ✓ ${theme.id.padEnd(8)} — tokens:${Object.keys(tokens).length ? 'yes' : 'no'}  fonts:${fontsPreload.length}  blocks:${content.content.length}`);
  }

  console.log(`\n✅ 5 seed presets generated. Commit & run \`pnpm sites:seed-presets\` to load into DB.`);
}

main();
