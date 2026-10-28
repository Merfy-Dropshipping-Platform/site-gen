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

// Наши секции части 5 блока 1 «Секций и SDK» (Р1-5-11…Р1-5-13) проходят приём целиком: формат, имена, шаблон, классы.
const files = async (folder: string): Promise<Record<string, string>> => {
  const dir = new URL(`../fixtures/${folder}/`, import.meta.url);
  const read = (name: string) => readFile(fileURLToPath(new URL(name, dir)), 'utf8');
  return { 'section.json': await read('section.json'), 'template.astro': await read('template.astro') };
};

describe('«Первый экран»', () => {
  it('принимается без проблем; поля — как в Р1-5-11', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('shop/hero') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const fields = settingFieldsOf(result.section.manifest.settings);
    expect(fields.map((field) => [field.id, field.setting.kind])).toEqual([
      ['images', 'image-pair'],
      ['height', 'radio'],
      ['overlay', 'range'],
      ['align', 'alignment'],
      ['heading-size', 'select'],
    ]);
    const blocks = result.section.manifest.blocks ?? {};
    expect(Object.keys(blocks)).toEqual(['heading', 'text', 'button']);
    expect(blocks.heading?.settings[0]?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(blocks.text?.settings[0]?.setting).toMatchObject({ kind: 'text', ai: 'description' });
    expect(result.section.manifest.wrapper).toBeUndefined();
  });
});

describe('«Шапка»', () => {
  // «Отступов» секции у шапки нет (28.10): отступ темы py-section давал пустую полосу под шапкой, свои отступы — в шаблоне.
  it('принимается; общие настройки в порядке прода: sticky, scheme между «Положением логотипа» и «Цветовой схемой меню», без padding', async () => {
    const result = await prepareSection({ prefix: 'shop', files: await files('shop/header') });
    expect(result.ok ? withoutCode(result.section.warnings) : result.problems).toEqual([]);
    if (!result.ok) return;
    const order = result.section.manifest.settings.map((entry) =>
      'wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id,
    );
    expect(order).toEqual(['logo-position', 'wrapper:sticky', 'wrapper:scheme', 'color-scheme', 'menu-type', 'menu']);
    expect(result.section.manifest.wrapper).toEqual(['scheme', 'sticky']);
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
