import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// Записи полей с записями в процессе рендера (блок 8 «Секций и SDK», часть 8г; Р8г-4): запрос несёт records — запись по
// id настройки или null; процесс рендера подставляет её в settings вместо значения настройки (id записи), как дерево
// меню. Нет records — значения настроек как есть.
const CARD = `---
const { settings } = Astro.props;
---
<p>{settings.product === null ? 'без товара' : settings.product.title}</p>`;
const OPTIONS = { richtext: { section: new Set<string>(), block: new Set<string>() }, blocks: false };

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function cardRequest(settings: Record<string, string | null>) {
  const checked = await checkTemplate(CARD, OPTIONS);
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return {
    section: 'shop:product-card',
    hash: sha256(Buffer.from(checked.render, 'utf8')),
    module: checked.render,
    settings,
  };
}

describe('записи полей с записями в процессе рендера', () => {
  it('запись поля — в settings вместо id; null — шаблон видит null', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const request = await cardRequest({ product: 'pled' });
    const chosen = await renderer.render({ ...request, records: { product: { id: 'p-2', title: 'Плед' } } });
    expect(chosen).toContain('<p>Плед</p>');
    expect(await renderer.render({ ...request, records: { product: null } })).toContain('<p>без товара</p>');
  }, 30_000);

  it('запрос без records — значения настроек как есть', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    expect(await renderer.render(await cardRequest({ product: null }))).toContain('<p>без товара</p>');
  }, 30_000);
});

describe('пробный рендер полей с записями', () => {
  it('шаблон без проверки поля на null — отказ render-failed: запись у мерчанта могут удалить', async () => {
    const files = {
      'section.json': JSON.stringify({
        sdk: 1,
        name: 'product-title',
        kind: 'section',
        title: 'Название товара',
        settings: [{ id: 'product', label: 'Выбор товара', setting: { kind: 'product' } }],
      }),
      'template.astro': '---\nconst { settings } = Astro.props;\n---\n<p class="m-0">{settings.product.title}</p>',
    };
    const result = await prepareInWorker({ prefix: 'shop', files });
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['render-failed']);
  }, 30_000);
});
