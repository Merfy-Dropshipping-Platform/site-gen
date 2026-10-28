import { describe, expect, it } from 'vitest';
import { readManifest } from '../src/format';
import { richtextIdsOf } from '../src/set-html';
import { templateProblems } from '../src/template';

// set:html — только с настройкой вида richtext (часть 3, Р58): значение очищено, Astro вставляет его без экранирования.
const FRONT = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const IDS = { section: new Set(['content']), block: new Set(['answer']) };
const REFUSED =
  'set:html можно только с настройкой вида richtext, string или text с ai, page.record.html или settings.<id>.html поля вида policy';
const messages = async (body: string): Promise<string[]> =>
  (await templateProblems(`${FRONT}${body}`, IDS)).map((item) => item.message);

describe('set:html', () => {
  it('можно: settings.<richtext> секции и <блок>.settings.<richtext> в blocks.map', async () => {
    expect(await messages('<div set:html={settings.content} />')).toEqual([]);
    expect(await messages("<div set:html={settings['content']} />")).toEqual([]);
    expect(await messages('<div>{blocks.map((block) => <div set:html={block.settings.answer} />)}</div>')).toEqual([]);
    expect(
      await messages('<ul>{blocks.map((item, index) => <li set:html={item.settings.answer} data-n={index} />)}</ul>'),
    ).toEqual([]);
  });

  it('нельзя: не richtext, строка, выражение, необязательная цепочка, не настройка блока', async () => {
    for (const body of [
      '<div set:html={settings.heading} />',
      '<div set:html="<b>x</b>" />',
      '<div set:html={settings.content + settings.content} />',
      '<div set:html={settings?.content} />',
      '<div>{blocks.map((block) => <div set:html={block.settings.question} />)}</div>',
      '<div>{blocks.map((block) => <div set:html={block.answer} />)}</div>',
    ])
      expect(await messages(body)).toEqual([REFUSED]);
  });

  it('нельзя: имя settings связано параметром; имя блока связано ещё где-то', async () => {
    expect(await messages('<div>{blocks.map((settings) => <div set:html={settings.content} />)}</div>')).toEqual([
      REFUSED,
    ]);
    expect(
      await messages(
        '<div>{blocks.map((block) => <div set:html={block.settings.answer} />)}{[1].map((block) => <i>{block}</i>)}</div>',
      ),
    ).toEqual([REFUSED]);
    expect(
      await messages(
        '<div>{blocks.map((block) => (block.settings.items ?? []).map((block) => <p set:html={block.settings.answer} />))}</div>',
      ),
    ).toEqual([REFUSED]);
  });

  it('без списка richtext — отказ, как в части 1', async () => {
    const problems = await templateProblems(`${FRONT}<div set:html={settings.content} />`);
    expect(problems.map((item) => item.message)).toEqual([REFUSED]);
  });

  it('id richtext у блоков — только если во всех типах, где он есть, он richtext', () => {
    const read = readManifest({
      'section.json': JSON.stringify({
        sdk: 1,
        name: 'faq',
        kind: 'section',
        title: 'Вопросы и ответы',
        settings: [
          { id: 'content', label: 'Текст', setting: { kind: 'richtext', default: '' } },
          { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: '' } },
        ],
        blocks: {
          question: {
            title: 'Вопрос',
            limit: 20,
            settings: [
              { id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '' } },
              { id: 'note', label: 'Пометка', setting: { kind: 'richtext', default: '' } },
            ],
          },
          tip: {
            title: 'Совет',
            limit: 5,
            settings: [{ id: 'note', label: 'Пометка', setting: { kind: 'string', default: '' } }],
          },
        },
      }),
    });
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    expect(richtextIdsOf(read.value)).toEqual({ section: new Set(['content']), block: new Set(['answer']) });
  });
});

describe('set:html: HTML записи (блок 8 «Секций и SDK», часть 8г-2)', () => {
  const PAGE_FRONT = '---\nconst { settings, page } = Astro.props;\n---\n';
  const RECORD_IDS = { section: new Set<string>(), block: new Set<string>(), html: new Set(['policy']) };
  const recordMessages = async (body: string): Promise<string[]> =>
    (await templateProblems(`${PAGE_FRONT}${body}`, RECORD_IDS)).map((item) => item.message);

  it('можно: page.record.html и settings.<id>.html поля вида policy', async () => {
    expect(await recordMessages('<div set:html={page.record.html} />')).toEqual([]);
    expect(await recordMessages("<div set:html={page['record']['html']} />")).toEqual([]);
    expect(await recordMessages('<div set:html={settings.policy.html} />')).toEqual([]);
  });

  it('нельзя: другие поля записи, поле не вида policy, имя связано параметром стрелки', async () => {
    for (const body of [
      '<div set:html={page.record.description} />',
      '<div set:html={settings.product.html} />',
      '<div set:html={page.html} />',
      '<div set:html={page.path.html} />',
      '<div set:html={settings.policy.title} />',
      '<ul>{[1].map((page) => <li set:html={page.record.html} />)}</ul>',
      '<ul>{[1].map((settings) => <li set:html={settings.policy.html} />)}</ul>',
    ])
      expect(await recordMessages(body)).toEqual([REFUSED]);
  });

  it('id полей вида policy — в html; без таких полей ключа нет', () => {
    const read = readManifest({
      'section.json': JSON.stringify({
        sdk: 1,
        name: 'page',
        kind: 'section',
        title: 'Страница',
        settings: [
          { id: 'policy', label: 'Выбор страницы', setting: { kind: 'policy' } },
          { id: 'text', label: 'Текст', setting: { kind: 'richtext', default: '' } },
        ],
      }),
    });
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    expect(richtextIdsOf(read.value)).toEqual({
      section: new Set(['text']),
      block: new Set(),
      html: new Set(['policy']),
    });
    expect(richtextIdsOf({ settings: [] })).toEqual({ section: new Set(), block: new Set() });
  });
});
