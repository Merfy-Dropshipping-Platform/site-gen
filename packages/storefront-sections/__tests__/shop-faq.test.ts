import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceProblems, attr, panelOf, renderSection, tags, type RenderedSection } from './shop-section-render';

// «Сворачиваемый раздел» (faq) — сводная секция пяти тем (базовые секции, 29.10): склеены прежние «Вопросы и ответы» и
// «Вопросы с плавным раскрытием». Панель — как у CollapsibleSection на проде (CustomFieldsPanel): «Заголовок», «Размер
// заголовка», «Контейнер», «Цветовая схема», «Цветовая схема контейнера», «Отступы»; раздел — заголовок и текст со своими
// размерами, до 10 разделов. Раскладка и значок (шеврон или плюс и минус) — после полей прода, в группе «Вид».
const ITEMS = [
  { id: 'question-1', type: 'question', settings: { heading: 'Как <em>стирать</em>?', 'heading-size': 'large', text: 'Только <strong>вручную</strong>', 'text-size': 'small' } },
  { id: 'question-2', type: 'question', settings: { heading: 'Доставка?', 'heading-size': 'medium', text: 'Два дня', 'text-size': 'medium' } },
];

let section: RenderedSection;
beforeAll(async () => {
  section = await renderSection('faq');
}, 60_000);
afterAll(async () => {
  await section.close();
});

const root = (source: string): string => tags(source, 'div').find((tag) => tag.includes('data-behavior="accordion"')) ?? '';

describe('«Сворачиваемый раздел»: панель', () => {
  it('принимается без проблем и предупреждений', async () => {
    expect(await acceptanceProblems('faq')).toEqual([]);
  }, 60_000);

  it('поля прода в их порядке и с их подписями, новые — в группе «Вид»', () => {
    expect(panelOf(section.manifest)).toEqual([
      ['heading', 'Заголовок', 'Содержание'],
      ['heading-size', 'Размер заголовка', undefined],
      ['item-box', 'Контейнер', undefined],
      ['wrapper:scheme', undefined, undefined],
      ['color-scheme', 'Цветовая схема контейнера', undefined],
      ['wrapper:padding', undefined, undefined],
      ['layout', 'Раскладка', 'Вид'],
      ['icon', 'Значок', undefined],
      ['open-first', 'Первый раздел', undefined],
    ]);
    expect(section.manifest.title).toBe('Сворачиваемый раздел');
  });

  it('раздел — заголовок и текст с ИИ («К», «Ж») и свои размеры; разделов до 10', () => {
    const block = section.manifest.blocks?.question;
    expect(block?.limit).toBe(10);
    expect(block?.settings.map((field) => field.id)).toEqual(['heading', 'heading-size', 'text', 'text-size']);
    expect(block?.settings[0]?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(block?.settings[2]?.setting).toMatchObject({ kind: 'text', ai: 'description' });
  });

  it('заготовка ставит секцию с тремя разделами: блоки по умолчанию — вопросы с ответами', () => {
    const blocks = section.manifest.defaultBlocks ?? [];
    expect(blocks.map((block) => block.type)).toEqual(['question', 'question', 'question']);
    for (const block of blocks) expect(Object.keys(block.settings)).toEqual(['heading', 'text']);
  });
});

describe('«Сворачиваемый раздел»: разметка', () => {
  it('по умолчанию — вид flux: узкая колонка, шеврон, без контейнера; раскрытие — поведение accordion', async () => {
    const source = await section.html({ blocks: ITEMS });
    const tag = root(source);
    expect(attr(tag, 'data-layout')).toBe('column');
    expect(attr(tag, 'data-icon')).toBe('chevron');
    expect(attr(tag, 'data-box')).toBe('false');
    expect(tag).toContain('data-[layout=column]:max-w-195');
    expect(tags(source, 'details')).toHaveLength(2);
    expect(source.match(/data-part="content"/g)).toHaveLength(2);
    expect(tags(source, 'details').join('')).not.toMatch(/\sopen[\s>=]/);
  });

  it('заголовки и ответы — с «К» и «Ж», размеры — признаками раздела', async () => {
    const source = await section.html({ blocks: ITEMS, settings: { heading: 'Частые <em>вопросы</em>' } });
    expect(source).toMatch(/<h2\b[^>]*>Частые <em>вопросы<\/em><\/h2>/);
    expect(source).toContain('Как <em>стирать</em>?');
    expect(source).toMatch(/<div\b[^>]*data-part="content"[^>]*>Только <strong>вручную<\/strong><\/div>/);
    const summaries = tags(source, 'summary');
    expect(summaries.map((tag) => attr(tag, 'data-heading-size'))).toEqual(['large', 'medium']);
    expect(tags(source, 'div').filter((tag) => tag.includes('data-part="content"')).map((tag) => attr(tag, 'data-text-size'))).toEqual(['small', 'medium']);
  });

  it('«Первый раздел: открыт» — открыт только первый', async () => {
    const source = await section.html({ blocks: ITEMS, settings: { 'open-first': true } });
    expect(tags(source, 'details').map((tag) => /\sopen[\s>=]/.test(tag))).toEqual([true, false]);
  });

  it('значок и раскладка — признаками на корне; значки — три на раздел, видимость — вариантами классов', async () => {
    const source = await section.html({ blocks: ITEMS, settings: { icon: 'plus-minus', layout: 'wide' } });
    const tag = root(source);
    expect(attr(tag, 'data-icon')).toBe('plus-minus');
    expect(attr(tag, 'data-layout')).toBe('wide');
    expect(tags(source, 'svg')).toHaveLength(6);
    expect(source).toContain('in-data-[icon=plus-minus]:hidden');
    expect(source).toContain('in-data-[icon=chevron]:hidden');
    expect(source).toContain('group-open:in-data-[icon=plus-minus]:block');
  });

  it('контейнер — карточки; цвет карточки — «Цветовая схема контейнера», только при включённом контейнере', async () => {
    const on = await section.html({ blocks: ITEMS, settings: { 'item-box': true, 'color-scheme': 'scheme-4' } });
    expect(attr(root(on), 'data-box')).toBe('true');
    expect(tags(on, 'details').every((tag) => tag.includes('color-scheme-4'))).toBe(true);
    const off = await section.html({ blocks: ITEMS, settings: { 'item-box': false, 'color-scheme': 'scheme-4' } });
    expect(off).not.toContain('color-scheme-4');
  });

  it('пустой заголовок — заголовка нет; разделов нет — раскрывающихся нет', async () => {
    const source = await section.html({ settings: { heading: '' } });
    expect(tags(source, 'h2')).toEqual([]);
    expect(tags(source, 'details')).toEqual([]);
  });
});
