import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { scopeOf } from '../src/style';

const manifest = (name: string, kind = 'section', title = 'Секция'): string =>
  JSON.stringify({ v: 1, name, kind, title });

const COLOR_MATCH = {
  'section.json': manifest('color-match', 'section', 'Подбор шарфа по цвету пальто'),
  'template.html': '<div class="advice" data-advice>Выберите цвет пальто</div>',
  'styles.css': '.advice { color: var(--color-text); border: 1px solid #000; }',
  'script.ts': "import { defineSection } from '@merfy/shell';\nexport default defineSection({ mount() {} });",
};

describe('одна функция приёма', () => {
  it('секция: имя с приставкой двери, шаблон как есть, стили в рамке, скрипт собран, предупреждения — с ней', async () => {
    const result = await prepareSection({ prefix: 'shop', files: COLOR_MATCH });
    const section = result.ok ? result.section : null;
    expect(section?.name).toBe('shop:color-match');
    expect(section?.template).toBe(COLOR_MATCH['template.html']);
    expect(section?.style).toBe(
      `${scopeOf('shop:color-match')} .advice { color: var(--color-text); border: 1px solid #000; }`,
    );
    expect(section?.script).toContain('from"@merfy/shell"');
    expect(section?.warnings.map((item) => item.code)).toEqual(['style-raw-color']);
    expect(section?.manifest.fields).toEqual([]);
  });

  it('без скрипта — script null (п. 16); глобальный скрипт — без шаблона и стилей', async () => {
    const plain = await prepareSection({
      prefix: 'nova',
      files: { 'section.json': manifest('notice'), 'template.html': '<p>Доставка по всей России</p>' },
    });
    expect(plain.ok && plain.section.script).toBeNull();
    const geo = await prepareSection({
      prefix: 'geo',
      files: {
        'section.json': manifest('locate', 'global', 'Город покупателя'),
        'script.ts': "export default { mount() { document.documentElement.dataset.geo = 'ok'; } };",
      },
    });
    expect(geo.ok && [geo.section.name, geo.section.template, geo.section.style]).toEqual(['geo:locate', '', '']);
  });

  it('шаблон, стили и скрипт — все отказы одним ответом', async () => {
    const result = await prepareSection({
      prefix: 'reviews',
      files: {
        'section.json': manifest('list', 'section', 'Отзывы'),
        'template.html': '<script>x()</script>',
        'styles.css': 'body { margin: 0; }',
        'script.ts': "import confetti from 'canvas-confetti';\nexport default { mount() { confetti(); } };",
      },
    });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual([
      'template-forbidden',
      'style-forbidden',
      'import-forbidden',
    ]);
  });

  it('section.json не тот или вида не хватает — отказ до сборки', async () => {
    const broken = await prepareSection({ prefix: 'shop', files: { ...COLOR_MATCH, 'section.json': '{}' } });
    expect(broken.ok ? [] : [...new Set(broken.problems.map((item) => item.code))]).toEqual(['manifest-invalid']);
    const noTemplate = await prepareSection({ prefix: 'shop', files: { 'section.json': manifest('empty') } });
    expect(noTemplate.ok ? [] : noTemplate.problems.map((item) => item.code)).toEqual(['kind-mismatch']);
  });

  it('незнакомый файл — отказ file-unknown', async () => {
    const result = await prepareSection({ prefix: 'shop', files: { ...COLOR_MATCH, 'notes.txt': 'черновик' } });
    expect(result.ok ? [] : result.problems.map((item) => [item.code, item.file])).toEqual([
      ['file-unknown', 'notes.txt'],
    ]);
  });
});
