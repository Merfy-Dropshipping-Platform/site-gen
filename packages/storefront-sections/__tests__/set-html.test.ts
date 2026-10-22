import { describe, expect, it } from 'vitest';
import { readManifest } from '../src/format';
import { richtextIdsOf } from '../src/set-html';
import { templateProblems } from '../src/template';

// set:html — только с настройкой вида richtext (часть 3, Р58): значение очищено, Astro вставляет его без экранирования.
const FRONT = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const IDS = { section: new Set(['content']), block: new Set(['answer']) };
const REFUSED = 'set:html можно только с настройкой вида richtext';
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
