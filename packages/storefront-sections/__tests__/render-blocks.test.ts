import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate } from '../src/compile';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// Блоки в шаблоне (часть 3, Р57): Astro.props.blocks — показанные блоки; в превью у корня блока — data-merfy-block.
const FAQ = `---
const { settings, blocks } = Astro.props;
---
<div class="flex flex-col">
  <h2>{settings.heading}</h2>
  {blocks.map((block) => (
    <details>
      <summary>{block.settings.question}</summary>
      <div set:html={block.settings.answer}></div>
    </details>
  ))}
</div>`;
const OPTIONS = { richtext: { section: new Set<string>(), block: new Set(['answer']) }, blocks: true };
const BLOCKS = [
  { id: 'question-1', type: 'question', settings: { question: 'Как стирать?', answer: '<p>Руками</p>' } },
  { id: 'question-k3f9x2a1', type: 'question', settings: { question: 'Доставка?', answer: '<p>Два дня</p>' } },
];

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

async function faqRequest() {
  const checked = await checkTemplate(FAQ, OPTIONS);
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  return {
    section: 'shop:faq',
    hash: sha256(Buffer.from(checked.render, 'utf8')),
    module: checked.render,
    settings: { heading: 'Вопросы' },
  };
}

describe('блоки в процессе рендера', () => {
  it('блоки — по порядку, ответ richtext — HTML как есть; на витрине метки нет', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const html = await renderer.render({ ...(await faqRequest()), blocks: BLOCKS, preview: false });
    expect(html.indexOf('Как стирать?')).toBeLessThan(html.indexOf('Доставка?'));
    expect(html).toContain('<p>Руками</p>');
    expect(html).not.toContain('data-merfy-block');
  }, 30_000);

  it('в превью у корня каждого блока — data-merfy-block с id; без blocks — пустой список', async () => {
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const request = await faqRequest();
    const preview = await renderer.render({ ...request, blocks: BLOCKS, preview: true });
    expect([...preview.matchAll(/data-merfy-block="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'question-1',
      'question-k3f9x2a1',
    ]);
    const empty = await renderer.render(request);
    expect(empty).toContain('Вопросы');
    expect(empty).not.toContain('<details');
  }, 30_000);
});
