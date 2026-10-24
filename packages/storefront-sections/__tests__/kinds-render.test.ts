import { describe, expect, it } from 'vitest';
import { prepareInWorker } from '../src/sandbox';

// Пробный рендер получает значения всех новых видов: по умолчанию и пустые (часть 5 блока 1 «Секций и SDK», Р1-5-2).
const FIELDS = [
  {
    id: 'images',
    label: 'Изображения',
    setting: { kind: 'image-pair', default: { url1: '', url2: '' }, maxBytes: 2_097_152 },
  },
  { id: 'overlay', label: 'Затемнение', setting: { kind: 'range', default: 30, min: 0, max: 100, step: 5 } },
  { id: 'space', label: 'Отступы', setting: { kind: 'padding', default: null, max: 120, step: 8 } },
  { id: 'align', label: 'Выравнивание', setting: { kind: 'alignment', default: 'center' } },
];
const input = (template: string) => ({
  prefix: 'shop',
  files: {
    'section.json': JSON.stringify({ sdk: 1, name: 'kinds', kind: 'section', title: 'Виды', settings: FIELDS }),
    'template.astro': template,
  },
});
const READ = `---
const { settings } = Astro.props;
---
<div data-overlay={settings.overlay + 1} data-url={settings.images.url1} data-align={settings.align} data-space={settings.space === null ? 'none' : settings.space.top}>x</div>`;

describe('пробный рендер со значениями новых видов', () => {
  it('число, объект и null доходят до шаблона: приём проходит', async () => {
    expect(await prepareInWorker(input(READ))).toMatchObject({ ok: true });
  });

  it('шаблон, который читает поле null как объект, — render-failed', async () => {
    const result = await prepareInWorker(
      input('---\nconst { settings } = Astro.props;\n---\n<p>{settings.space.top}</p>'),
    );
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toContain('render-failed');
  });
});
