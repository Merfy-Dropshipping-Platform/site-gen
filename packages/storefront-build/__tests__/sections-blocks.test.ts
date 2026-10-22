import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { placedSections } from '../src/code';
import { renderSection, type SectionRenderRequest, type SectionsRender } from '../src/sections-render';
import { codeInputs } from './support-code';

// Блоки в запросе рендера (часть 3): блоки места секции и режим страницы уходят в процесс рендера.
const MODULE = 'export default 1;';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const BLOCKS = [{ id: 'question-1', type: 'question', settings: { question: 'Как стирать?' } }];

function recorder(): { sections: SectionsRender; seen: SectionRenderRequest[] } {
  const seen: SectionRenderRequest[] = [];
  const render = (request: SectionRenderRequest): Promise<string> => {
    seen.push(request);
    return Promise.resolve('<p>x</p>');
  };
  return { seen, sections: { modules: new Map([[HASH, MODULE]]), render } };
}

describe('блоки секции в сборке', () => {
  it('блоки и режим — в запросе; у места без блоков — пустой список', async () => {
    const { sections, seen } = recorder();
    const faq = { id: 'faq-1', name: 'shop:faq', hash: HASH, settings: {}, blocks: BLOCKS };
    await renderSection(faq, sections, 'preview');
    await renderSection(faq, sections, 'live');
    await renderSection({ id: 'hero-1', name: 'shop:hero', hash: HASH, settings: {} }, sections, 'live');
    expect(seen.map(({ blocks, preview }) => ({ blocks, preview }))).toEqual([
      { blocks: BLOCKS, preview: true },
      { blocks: BLOCKS, preview: false },
      { blocks: [], preview: false },
    ]);
  });

  it('блоки экземпляра доходят до места секции; у экземпляра без блоков ключа нет', () => {
    const inputs = codeInputs((changed) => {
      changed.code.pages = {
        home: [
          { id: 'hero-1', section: 'shop:hero', settings: {}, blocks: BLOCKS },
          { id: 'hero-2', section: 'shop:hero', settings: {} },
        ],
      };
    });
    const placed = placedSections(inputs, 'home');
    expect(placed.map((section) => section.blocks)).toEqual([BLOCKS, undefined]);
    expect(placed.map((section) => 'blocks' in section)).toEqual([true, false]);
  });
});
