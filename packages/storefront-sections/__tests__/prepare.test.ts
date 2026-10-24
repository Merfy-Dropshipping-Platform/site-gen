import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';

const manifest = (name: string, kind = 'section', title = 'Секция'): string =>
  JSON.stringify({ sdk: 1, name, kind, title });

const COLOR_MATCH = {
  'section.json': manifest('color-match', 'section', 'Подбор шарфа по цвету пальто'),
  'template.astro': '<div class="mt-4" data-advice>Выберите цвет пальто</div>',
  'script.ts': "import { defineSection } from '@merfy/shell';\nexport default defineSection({ mount() {} });",
};

describe('одна функция приёма', () => {
  it('секция: имя с префиксом способа сохранения, шаблон как есть, скрипт собран, предупреждения — с ней', async () => {
    const result = await prepareSection({ prefix: 'shop', files: COLOR_MATCH });
    const section = result.ok ? result.section : null;
    expect(section?.name).toBe('shop:color-match');
    expect(section?.template).toBe(COLOR_MATCH['template.astro']);
    expect(section?.script).not.toContain('@merfy/shell');
    expect(section?.warnings).toEqual([]);
    expect(section?.manifest.settings).toEqual([]);
  });

  it('без скрипта — script null (п. 16); глобальный скрипт — без шаблона и стилей', async () => {
    const plain = await prepareSection({
      prefix: 'nova',
      files: { 'section.json': manifest('notice'), 'template.astro': '<p>Доставка по всей России</p>' },
    });
    expect(plain.ok && plain.section.script).toBeNull();
    const geo = await prepareSection({
      prefix: 'geo',
      files: {
        'section.json': manifest('locate', 'global', 'Город покупателя'),
        'script.ts':
          "import { defineSection } from '@merfy/shell';\nexport default defineSection({ mount(_el, ctx) { ctx.log('город'); } });",
      },
    });
    expect(geo.ok && [geo.section.name, geo.section.template]).toEqual(['geo:locate', '']);
  });

  it('шаблон, стили и скрипт — все отказы одним ответом', async () => {
    const result = await prepareSection({
      prefix: 'reviews',
      files: {
        'section.json': manifest('list', 'section', 'Отзывы'),
        'template.astro': '<script>x()</script>',
        'script.ts':
          "import confetti from 'canvas-confetti';\nimport { defineSection } from '@merfy/shell';\nexport default defineSection({ mount() { confetti(); } });",
      },
    });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual([
      'template-forbidden',
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
