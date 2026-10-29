import { fileURLToPath } from 'node:url';
import { sha256, type RenderBlock, type SettingValues, type ShopProps } from '@merfy/storefront-build';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer } from '../src/render';
import { CODE_TASTE_CODES } from '../src/taste-code';

// Рендер нашей секции магазина из fixtures/shop для тестов: шаблон проверяется и собирается как при приёме, значения
// настроек и блоки — те, что дали тесту; остальное — умолчания секции. Срок рендера щедрый: тест не должен краснеть
// из-за загрузки машины (боевой срок — RENDER_LIMITS, его проверяют тесты render.ts).
const TEST_RENDER_MS = 15_000;

export interface Variant {
  settings?: SettingValues;
  blocks?: readonly RenderBlock[];
  shop?: ShopProps;
}

export interface RenderedSection {
  readonly manifest: SectionManifest;
  readonly html: (variant?: Variant) => Promise<string>;
  readonly close: () => Promise<void>;
}

export const folderOf = (name: string): string => fileURLToPath(new URL(`../fixtures/shop/${name}`, import.meta.url));

// Значения настроек по умолчанию из section.json: поля с `setting.default`, без общих настроек (`wrapper`).
function defaultsOf(manifest: SectionManifest): SettingValues {
  const values: Record<string, string | number | boolean> = {};
  for (const entry of manifest.settings) {
    if ('wrapper' in entry) continue;
    const value = 'default' in entry.setting ? entry.setting.default : undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[entry.id] = value;
  }
  return values;
}

export async function renderSection(name: string): Promise<RenderedSection> {
  const files = await readSectionFolder(folderOf(name));
  const read = readManifest(files);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  const manifest = read.value;
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  const module = checked.render;
  const hash = sha256(Buffer.from(module, 'utf8'));
  const renderer = startSectionRenderer({ limits: { timeoutMs: TEST_RENDER_MS } });
  return {
    manifest,
    html: (variant = {}) =>
      renderer.render({
        section: `shop:${name}`,
        hash,
        module,
        settings: { ...defaultsOf(manifest), ...variant.settings },
        blocks: variant.blocks ?? [],
        ...(variant.shop === undefined ? {} : { shop: variant.shop }),
      }),
    close: () => renderer.close(),
  };
}

// Панель секции: id поля (или `wrapper:<id>` у общих настроек), подпись, группа.
export const panelOf = (manifest: SectionManifest): (string | undefined)[][] =>
  manifest.settings.map((entry) =>
    'wrapper' in entry ? [`wrapper:${entry.wrapper}`, undefined, undefined] : [entry.id, entry.label, entry.section],
  );

export const fieldOf = (manifest: SectionManifest, id: string): SectionManifest['settings'][number] | undefined =>
  manifest.settings.find((entry) => 'id' in entry && entry.id === id);

// Приём секции целиком, как при сохранении в магазин: формат, имена, шаблон, классы, скрипт, пробные рендеры. Пусто —
// секция принята без проблем и предупреждений (предупреждения кода шаблона, `taste-code`, у наших секций пока не в счёт).
export async function acceptanceProblems(name: string): Promise<string[]> {
  const result = await prepareSection({ prefix: 'shop', files: await readSectionFolder(folderOf(name)) });
  const items = result.ok ? result.section.warnings.filter((item) => !CODE_TASTE_CODES.has(item.code)) : result.problems;
  return items.map((item) => `${item.code} ${item.message}`);
}

// Открывающие теги элемента и значение атрибута — для проверок разметки без разбора DOM.
export const tags = (source: string, name: string): string[] => source.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
export const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
