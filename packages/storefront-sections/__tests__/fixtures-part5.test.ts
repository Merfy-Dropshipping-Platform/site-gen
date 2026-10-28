import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { settingFieldsOf } from '../src/fields';
import { prepareSection } from '../src/prepare';
import type { SectionProblem } from '../src/problems';
import { CODE_TASTE_CODES } from '../src/taste-code';

// Предупреждения кода шаблона (taste-code.ts) у наших секций пока не в счёт: список срабатываний — в PR правил кода,
// секции переписывает отдельная задача.
const withoutCode = (warnings: readonly SectionProblem[]): SectionProblem[] =>
  warnings.filter((item) => !CODE_TASTE_CODES.has(item.code));

// Значения вариантов поля-выбора по его id; у поля без вариантов — пусто.
const optionValues = (fields: ReturnType<typeof settingFieldsOf>, id: string): string[] => {
  const setting = fields.find((field) => field.id === id)?.setting;
  return setting !== undefined && 'options' in setting ? setting.options.map((option) => option.value) : [];
};

// Наши секции части 5 блока 1 «Секций и SDK» (Р1-5-11…Р1-5-13) проходят приём целиком: формат, имена, шаблон, классы.
const files = async (folder: string): Promise<Record<string, string>> => {
  const dir = new URL(`../fixtures/${folder}/`, import.meta.url);
  const read = (name: string) => readFile(fileURLToPath(new URL(name, dir)), 'utf8');
  return { 'section.json': await read('section.json'), 'template.astro': await read('template.astro') };
};

describe('«Первый экран»', () => {
  // Сводный первый экран пяти тем (базовые секции, 29.10): панель прода — «Изображения», «Размер», «Затемнение», группа
  // «Содержание» (позиция, выравнивание, контейнер), «Цветовая схема», «Отступы»; дальше — раскладка. Заголовок и текст
  // несут свой размер, основная и дополнительная кнопка — отдельные блоки.
  it('принимается без проблем; поля в порядке прода, раскладка — после полей прода', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('shop/hero') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const order = result.section.manifest.settings.map((entry) =>
      'wrapper' in entry ? `wrapper:${entry.wrapper}` : `${entry.id}:${entry.setting.kind}`,
    );
    expect(order).toEqual([
      'images:image-pair',
      'height:select',
      'overlay:range',
      'content-position:select',
      'align:alignment',
      'text-box:toggle',
      'wrapper:scheme',
      'wrapper:padding',
      'layout:select',
      'image-position:radio',
    ]);
    expect(optionValues(settingFieldsOf(result.section.manifest.settings), 'content-position')).toEqual([
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ]);
    const blocks = result.section.manifest.blocks ?? {};
    expect(Object.keys(blocks)).toEqual(['heading', 'text', 'button', 'button-second']);
    expect(blocks.heading?.settings.map((field) => field.id)).toEqual(['heading', 'heading-size']);
    expect(blocks.text?.settings.map((field) => field.id)).toEqual(['text', 'text-size']);
    expect(blocks.heading?.settings[0]?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(blocks.text?.settings[0]?.setting).toMatchObject({ kind: 'text', ai: 'description' });
    expect(result.section.manifest.wrapper).toEqual(['scheme', 'padding']);
  });
});

describe('«Слайд-шоу»', () => {
  // Сводное слайд-шоу (базовые секции, 29.10): параметры прода — «Положение изображения», «Размер», «Интервал»,
  // «Нумерация страниц»; слайд — 12 полей прода (предел поля блока 16, E11).
  it('принимается без проблем; в слайде 12 полей прода в их порядке', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('shop/slideshow') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const order = result.section.manifest.settings.map((entry) => ('wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id));
    expect(order).toEqual(['image-frame', 'height', 'autoplay', 'interval', 'numbering', 'wrapper:scheme', 'wrapper:padding']);
    const slide = result.section.manifest.blocks?.slide;
    expect(slide?.limit).toBe(5);
    expect(slide?.settings.map((field) => field.id)).toEqual([
      'image',
      'overlay',
      'heading',
      'heading-size',
      'text',
      'text-size',
      'button-label',
      'button-link',
      'text-box',
      'content-position',
      'align',
      'color-scheme',
    ]);
    expect(optionValues(settingFieldsOf(result.section.manifest.settings), 'numbering')).toEqual([
      'numbers',
      'dots',
      'lines',
      'counter',
      'none',
    ]);
  });
});

describe('«Шапка»', () => {
  // Сводная шапка пяти тем (базовые секции, 28.10): панель прода — «Положение логотипа», «Статичность», «Цветовая
  // схема», «Отступы», группа «Меню»; дальше параметры раскладок тем. Отступы по умолчанию ставит заготовка (8 px), без
  // правки — отступ темы, как у любой секции.
  it('принимается; поля в порядке прода: sticky, scheme, padding между «Положением логотипа» и «Цветовой схемой меню»', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('shop/header') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const order = result.section.manifest.settings.map((entry) =>
      'wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id,
    );
    expect(order).toEqual([
      'logo-position',
      'wrapper:sticky',
      'wrapper:scheme',
      'wrapper:padding',
      'color-scheme',
      'menu-type',
      'menu',
      'active-link',
      'capitals',
      'announcement',
      'link',
    ]);
    expect(result.section.manifest.wrapper).toEqual(['scheme', 'padding', 'sticky']);
  });
});

describe('тестовая секция всех видов', () => {
  it('принимается; в ней все виды панели секций: шесть видов панели темы, richtext, image-pair, radio, range, alignment, color-scheme, padding и ai', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('sections/kinds') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const kinds = new Set(settingFieldsOf(result.section.manifest.settings).map((field) => field.setting.kind));
    for (const kind of [
      'string',
      'text',
      'richtext',
      'url',
      'image',
      'image-pair',
      'select',
      'radio',
      'toggle',
      'range',
      'alignment',
      'color-scheme',
      'padding',
    ]) {
      expect(kinds).toContain(kind);
    }
    const ai = settingFieldsOf(result.section.manifest.settings).filter((field) => 'ai' in field.setting);
    expect(ai.length).toBeGreaterThan(0);
  });
});
