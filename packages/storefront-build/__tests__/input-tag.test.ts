import { describe, expect, it } from 'vitest';
import { SECTION_INPUT_MAX_BYTES, sectionInputTag } from '../src/input-tag';
import {
  renderSection,
  type PlacedSection,
  type SectionFailure,
  type SectionRenderRequest,
} from '../src/sections-render';
import { RENDERS } from './support-code';

// Тег входных данных (design.md блока 5, раздел 3.5): договор с читателем ядра секций readSectionInput (5а).
const [HASH = ''] = [...RENDERS.keys()];
const PLACED: PlacedSection = {
  id: 'pick-1',
  name: 'shop:scarf-match',
  hash: HASH,
  settings: { title: 'Подберите шарф к пальто', framed: true },
  blocks: [{ id: 'scarf-1', type: 'scarf', settings: { name: 'Кашемировый шарф', 'goes-with': 'grey black' } }],
  script: true,
};
const render = (request: SectionRenderRequest): Promise<string> => Promise.resolve(`<h2>${request.section}</h2>`);
const sections = { modules: RENDERS, render };
const jsonOf = (tag: string): unknown => JSON.parse(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));

function thrownBy(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('ошибки не было, а должна быть');
}

describe('тег входных данных', () => {
  it('{ settings, blocks: [{ id, type, settings }], data: {} } — только значения шаблона, без хешей и имени экземпляра', () => {
    const tag = sectionInputTag(PLACED);
    expect(tag.startsWith('<script type="application/json" data-merfy-input>')).toBe(true);
    expect(jsonOf(tag)).toEqual({
      settings: { title: 'Подберите шарф к пальто', framed: true },
      blocks: [{ id: 'scarf-1', type: 'scarf', settings: { name: 'Кашемировый шарф', 'goes-with': 'grey black' } }],
      data: {},
    });
    expect(tag).not.toContain(HASH);
    expect(tag).not.toContain('pick-1');
  });

  it('«</script>» в настройке тег не закрывает', () => {
    const tag = sectionInputTag({ ...PLACED, settings: { title: '</script><script>alert(1)</script>' } });
    expect(tag.split('</script>')).toHaveLength(2);
    expect(jsonOf(tag)).toMatchObject({ settings: { title: '</script><script>alert(1)</script>' } });
  });

  it('больше 32 КБ — ошибка со стадией render-output и меткой [input-too-large]', () => {
    const big = { ...PLACED, settings: { title: 'ш'.repeat(SECTION_INPUT_MAX_BYTES / 2) } };
    expect(thrownBy(() => sectionInputTag(big))).toMatchObject({ stage: 'render-output' });
    expect(() => sectionInputTag(big)).toThrow('[input-too-large]');
  });
});

describe('тег в обёртке секции', () => {
  it('у секции со скриптом — последним дочерним элементом обёртки; без скрипта — тега нет', async () => {
    const html = await renderSection(PLACED, sections, 'live');
    expect(html).toMatch(
      /^<merfy-section [^>]+><h2>shop:scarf-match<\/h2><script type="application\/json" data-merfy-input>.*<\/script><\/merfy-section>$/,
    );
    const plain = await renderSection({ ...PLACED, script: false }, sections, 'live');
    expect(plain).not.toContain('data-merfy-input');
  });

  it('витрина: тег больше 32 КБ — секции нет, сбой render-output; превью — красная рамка', async () => {
    const big = { ...PLACED, settings: { title: 'ш'.repeat(SECTION_INPUT_MAX_BYTES / 2) } };
    const failures: SectionFailure[] = [];
    expect(await renderSection(big, sections, 'live', (failure) => failures.push(failure))).toBe('');
    expect(failures.map((failure) => [failure.section, failure.stage])).toEqual([
      ['shop:scarf-match', 'render-output'],
    ]);
    expect(failures[0]?.message).toContain('[input-too-large]');
    expect(await renderSection(big, sections, 'preview')).toContain('data-merfy-error');
  });
});
