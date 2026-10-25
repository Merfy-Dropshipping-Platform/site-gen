import { sha256 } from '@merfy/storefront-build';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTemplate, compileTemplate } from '../src/compile';
import { editTargetsOf, markEdits, type EditTarget, type EditTargets } from '../src/edit-marks';
import { readManifest } from '../src/format';
import { applyInserts } from '../src/marks';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// Правка текста в превью (блок 1 «Секций и SDK», часть 6, design.md 3.18, Р1-6-1…Р1-6-5): флаг inlineEdit в section.json,
// места правки по дереву шаблона, ошибка inline-edit-unavailable, служебные атрибуты только в превью.
const HEAD = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const target = (kind: EditTarget['kind'], label: string): EditTarget => ({ kind, label });
const SECTION_TARGETS: EditTargets = {
  section: new Map([
    ['heading', target('string', 'Заголовок')],
    ['text', target('richtext', 'Текст')],
  ]),
  block: new Map(),
};
const ONLY_HEADING: EditTargets = { section: new Map([['heading', target('string', 'Заголовок')]]), block: new Map() };
const BLOCK_TARGETS: EditTargets = {
  section: new Map(),
  block: new Map([
    ['question', target('string', 'Вопрос')],
    ['answer', target('richtext', 'Ответ')],
  ]),
};

const insertText = (attribute: string, call: string, label: string): string =>
  ` ${attribute}={Astro.props.__merfy.${call}} data-merfy-placeholder={Astro.props.__merfy.hint("${label}")}`;
const placeOf = (text: string, needle: string): { line: number; column: number } => {
  const before = text.slice(0, text.indexOf(needle)).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
};
const unavailable = (text: string, needle: string | null, message: string) => ({
  code: 'inline-edit-unavailable',
  file: 'template.astro',
  line: needle === null ? null : placeOf(text, needle).line,
  column: needle === null ? null : placeOf(text, needle).column,
  message,
});
const TEXT_MESSAGE = (path: string, id: string, label: string): string =>
  `правка в превью: у настройки «${label}» (${id}) нет места — нужен элемент, всё содержимое которого — {${path}.${id}}`;
const HTML_MESSAGE = (path: string, id: string, label: string): string =>
  `правка в превью: у настройки «${label}» (${id}) нет места — нужен элемент с set:html={${path}.${id}} и без другого содержимого`;

const field = (id: string, kind: string, label: string, inlineEdit?: unknown) => ({
  id,
  label,
  setting: { kind, default: '', ...(inlineEdit === undefined ? {} : { inlineEdit }) },
});
const manifestFiles = (settings: unknown[], blocks?: Record<string, unknown>) => ({
  'section.json': JSON.stringify({
    sdk: 1,
    name: 'probe',
    kind: 'section',
    title: 'Проба',
    settings,
    ...(blocks === undefined ? {} : { blocks }),
  }),
});
const problemsOf = (settings: unknown[], blocks?: Record<string, unknown>): string[] => {
  const read = readManifest(manifestFiles(settings, blocks));
  return read.ok ? [] : read.problems.map((item) => `${item.code} ${item.message}`);
};
const WRONG_KIND = 'ключ inlineEdit — только у видов string, text и richtext';

describe('флаг inlineEdit в section.json', () => {
  it('string, text и richtext с флагом проходят; false тоже', () => {
    expect(
      problemsOf([
        field('heading', 'string', 'Заголовок', true),
        field('text', 'text', 'Текст', true),
        field('answer', 'richtext', 'Ответ', false),
      ]),
    ).toEqual([]);
  });

  it('у видов url и toggle, в секции и в блоке — setting-invalid с путём', () => {
    const link = { id: 'link', label: 'Ссылка', setting: { kind: 'url', default: '', inlineEdit: true } };
    const shown = {
      id: 'shown',
      label: 'Показать',
      setting: { kind: 'toggle', default: true, labels: { on: 'Да', off: 'Нет' }, inlineEdit: false },
    };
    const blocks = { item: { title: 'Пункт', limit: 3, settings: [link] } };
    expect(problemsOf([field('heading', 'string', 'Заголовок', true), link, shown], blocks)).toEqual([
      `setting-invalid settings.1.setting.inlineEdit: ${WRONG_KIND}`,
      `setting-invalid settings.2.setting.inlineEdit: ${WRONG_KIND}`,
      `setting-invalid blocks.item.settings.0.setting.inlineEdit: ${WRONG_KIND}`,
    ]);
  });

  it('значение не булево — manifest-invalid с путём к полю', () => {
    const found = problemsOf([field('heading', 'string', 'Заголовок', 'yes')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^manifest-invalid settings\.0\.setting/);
  });
});

describe('editTargetsOf: какие настройки правятся в превью', () => {
  it('секция — по флагу; блок — если флаг у всех типов блока, где есть настройка', () => {
    const read = readManifest(
      manifestFiles(
        [
          field('heading', 'string', 'Заголовок', true),
          field('text', 'richtext', 'Текст', true),
          field('caption', 'string', 'Подпись', false),
          field('link', 'url', 'Ссылка'),
        ],
        {
          item: {
            title: 'Пункт',
            limit: 3,
            settings: [
              field('question', 'string', 'Вопрос', true),
              field('answer', 'richtext', 'Ответ', true),
              field('label', 'string', 'Метка', true),
            ],
          },
          note: { title: 'Заметка', limit: 2, settings: [field('label', 'string', 'Метка')] },
        },
      ),
    );
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    const targets = editTargetsOf(read.value);
    expect([...targets.section]).toEqual([
      ['heading', { kind: 'string', label: 'Заголовок' }],
      ['text', { kind: 'richtext', label: 'Текст' }],
    ]);
    expect([...targets.block]).toEqual([
      ['question', { kind: 'string', label: 'Вопрос' }],
      ['answer', { kind: 'richtext', label: 'Ответ' }],
    ]);
  });

  it('без флагов — пусто', () => {
    const read = readManifest(manifestFiles([field('heading', 'string', 'Заголовок')]));
    if (!read.ok) throw new Error(JSON.stringify(read.problems));
    const targets = editTargetsOf(read.value);
    expect([targets.section.size, targets.block.size]).toEqual([0, 0]);
  });
});

describe('markEdits: место правки по дереву шаблона', () => {
  const PAGE = `${HEAD}<div>\n  <h1 class="m-0">{settings.heading}</h1>\n  <div class="t" set:html={settings.text}></div>\n</div>`;

  it('string — элемент с одним выражением, richtext — пустой элемент с set:html; вставки — в порядке текста', async () => {
    const marks = await markEdits(PAGE, SECTION_TARGETS);
    expect(marks.problems).toEqual([]);
    expect(marks.inserts).toEqual([
      { at: PAGE.indexOf('<h1') + '<h1'.length, text: insertText('data-merfy-edit', 'edit("heading")', 'Заголовок') },
      {
        at: PAGE.indexOf('<div class="t"') + '<div'.length,
        text: insertText('data-merfy-edit-html', 'edit("text")', 'Текст'),
      },
    ]);
    expect(applyInserts(PAGE, marks.inserts)).toBe(
      PAGE.replace('<h1 ', `<h1${insertText('data-merfy-edit', 'edit("heading")', 'Заголовок')} `).replace(
        '<div class="t"',
        `<div${insertText('data-merfy-edit-html', 'edit("text")', 'Текст')} class="t"`,
      ),
    );
  });

  it('пробелы и переводы строк вокруг выражения, settings["id"], вложенный элемент — метка у самого внутреннего', async () => {
    const spaced = `${HEAD}<h1>\n  { settings.heading }\n</h1>`;
    expect((await markEdits(spaced, ONLY_HEADING)).inserts).toHaveLength(1);
    const indexed = `${HEAD}<h1>{settings['heading']}</h1>`;
    expect((await markEdits(indexed, ONLY_HEADING)).inserts).toHaveLength(1);
    const nested = `${HEAD}<h1><span>{settings.heading}</span></h1>`;
    const marks = await markEdits(nested, ONLY_HEADING);
    expect(marks.problems).toEqual([]);
    expect(marks.inserts.map((item) => item.at)).toEqual([nested.indexOf('<span') + '<span'.length]);
  });

  it('два подходящих элемента — метка у первого по тексту, ошибки нет', async () => {
    const text = `${HEAD}<h1>{settings.heading}</h1><h2>{settings.heading}</h2>`;
    const marks = await markEdits(text, ONLY_HEADING);
    expect(marks.problems).toEqual([]);
    expect(marks.inserts.map((item) => item.at)).toEqual([text.indexOf('<h1') + '<h1'.length]);
  });

  it('настройка блока — внутри blocks.map, имя блока — параметр стрелки', async () => {
    const list = `${HEAD}<ul>{blocks.map((item) => (\n  <li><b>{item.settings.question}</b><div set:html={item.settings.answer}></div></li>\n))}</ul>`;
    const marks = await markEdits(list, BLOCK_TARGETS);
    expect(marks.problems).toEqual([]);
    expect(marks.inserts).toEqual([
      { at: list.indexOf('<b') + '<b'.length, text: insertText('data-merfy-edit', 'edit(item, "question")', 'Вопрос') },
      {
        at: list.indexOf('<div') + '<div'.length,
        text: insertText('data-merfy-edit-html', 'edit(item, "answer")', 'Ответ'),
      },
    ]);
  });

  it.each<[string, string, string]>([
    ['текст рядом с выражением', '<h1>{settings.heading} — магазин шарфов</h1>', 'settings.heading'],
    ['два выражения', '<h1>{settings.heading}{settings.heading}</h1>', 'settings.heading'],
    ['условие', '<h1>{settings.on ? settings.heading : ""}</h1>', 'settings.heading'],
    ['set:html у вида string', '<h1 set:html={settings.heading}></h1>', 'settings.heading'],
  ])(
    'нет места: %s — inline-edit-unavailable со строкой и столбцом первого вхождения',
    async (_name, markup, needle) => {
      const text = `${HEAD}${markup}`;
      const marks = await markEdits(text, ONLY_HEADING);
      expect(marks.inserts).toEqual([]);
      expect(marks.problems).toEqual([unavailable(text, needle, TEXT_MESSAGE('settings', 'heading', 'Заголовок'))]);
    },
  );

  it('пример design.md: <h1>{settings.title} — магазин шарфов</h1> — строка 4, столбец 6', async () => {
    const text = `${HEAD}<h1>{settings.title} — магазин шарфов</h1>`;
    const marks = await markEdits(text, {
      section: new Map([['title', target('string', 'Заголовок')]]),
      block: new Map(),
    });
    expect(marks.problems).toEqual([
      unavailable(text, 'settings.title', TEXT_MESSAGE('settings', 'title', 'Заголовок')),
    ]);
    expect(marks.problems[0]).toMatchObject({ line: 4, column: 6 });
  });

  it('richtext без set:html, настройка не выводится, блок вне blocks.map — ошибки с текстом своего вида', async () => {
    const asText = `${HEAD}<div>{settings.text}</div>`;
    expect((await markEdits(asText, SECTION_TARGETS)).problems).toEqual([
      unavailable(asText, null, TEXT_MESSAGE('settings', 'heading', 'Заголовок')),
      unavailable(asText, 'settings.text', HTML_MESSAGE('settings', 'text', 'Текст')),
    ]);
    const outside = `${HEAD}<ul>{blocks.map((item) => <li>{item.settings.question}</li>)}</ul><p>{item.settings.answer}</p>`;
    expect((await markEdits(outside, BLOCK_TARGETS)).problems).toEqual([
      unavailable(outside, 'item.settings.answer', HTML_MESSAGE('item.settings', 'answer', 'Ответ')),
    ]);
  });
});

describe('checkTemplate: метки правки вместе с метками блоков', () => {
  const FAQ = `${HEAD}<div>\n  <h2>{settings.heading}</h2>\n  {blocks.map((block) => (\n    <details>\n      <summary>{block.settings.question}</summary>\n      <div set:html={block.settings.answer}></div>\n    </details>\n  ))}\n</div>`;
  const OPTIONS = {
    richtext: { section: new Set<string>(), block: new Set(['answer']) },
    blocks: true,
    edits: {
      section: new Map([['heading', target('string', 'Заголовок')]]),
      block: BLOCK_TARGETS.block,
    } satisfies EditTargets,
  };

  it('в модуле — метки правки и метка блока; проблем нет', async () => {
    const checked = await checkTemplate(FAQ, OPTIONS);
    expect(checked.problems).toEqual([]);
    const code = checked.render ?? '';
    expect(code).toContain('__merfy.edit("heading")');
    expect(code).toContain('__merfy.edit(block, "question")');
    expect(code).toContain('__merfy.edit(block, "answer")');
    expect(code).toContain('__merfy.block(block)');
    expect(code).toContain('data-merfy-edit-html');
  });

  it('корень blocks.map и место правки — один элемент: обе метки', async () => {
    const text = `${HEAD}<ul>{blocks.map((item) => <li>{item.settings.question}</li>)}</ul>`;
    const checked = await checkTemplate(text, {
      richtext: { section: new Set<string>(), block: new Set<string>() },
      blocks: true,
      edits: { section: new Map(), block: new Map([['question', target('string', 'Вопрос')]]) },
    });
    expect(checked.problems).toEqual([]);
    expect(checked.render).toContain('__merfy.block(item)');
    expect(checked.render).toContain('__merfy.edit(item, "question")');
  });

  it('подпись со знаками " { } < & — шаблон компилируется, подпись цела', async () => {
    const label = 'Он сказал "привет" {x} </h1> & ещё';
    const marks = await markEdits(`${HEAD}<h1>{settings.heading}</h1>`, {
      section: new Map([['heading', target('string', label)]]),
      block: new Map(),
    });
    const compiled = await compileTemplate(applyInserts(`${HEAD}<h1>{settings.heading}</h1>`, marks.inserts));
    expect(compiled.ok).toBe(true);
  });

  it('нет места правки — ошибка, модуля нет; без edits в параметрах — как раньше, меток нет', async () => {
    const text = `${HEAD}<h1>{settings.heading} — магазин шарфов</h1>`;
    const failed = await checkTemplate(text, { ...OPTIONS, blocks: false });
    expect(failed.render).toBeNull();
    expect(failed.problems.map((item) => item.code)).toContain('inline-edit-unavailable');
    const plain = await checkTemplate(text, { richtext: OPTIONS.richtext, blocks: false });
    expect(plain.problems).toEqual([]);
    expect(plain.render).not.toContain('__merfy');
  });
});

const opened: SectionRenderer[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((renderer) => renderer.close()));
});

const strip = (html: string): string => html.replace(/ data-merfy-(?:edit|edit-html|placeholder|block)="[^"]*"/g, '');

describe('рендер: служебные атрибуты только в превью', () => {
  const LABEL = 'Он сказал "привет" {x}';
  const FULL = `${HEAD}<div>\n  <h2>{settings.heading}</h2>\n  <div set:html={settings.text}></div>\n  <ul>{blocks.map((item) => (\n    <li><b>{item.settings.question}</b></li>\n  ))}</ul>\n</div>`;
  const OPTIONS = {
    richtext: { section: new Set(['text']), block: new Set<string>() },
    blocks: true,
    edits: {
      section: new Map([
        ['heading', target('string', LABEL)],
        ['text', target('richtext', 'Текст')],
      ]),
      block: new Map([['question', target('string', 'Вопрос')]]),
    } satisfies EditTargets,
  };

  it('на витрине атрибутов нет; в превью — путь и подпись; без атрибутов HTML тот же', async () => {
    const checked = await checkTemplate(FULL, OPTIONS);
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    const request = {
      section: 'shop:probe',
      hash: sha256(Buffer.from(checked.render, 'utf8')),
      module: checked.render,
      settings: { heading: 'Шарфы', text: '<p>Тёплые</p>' },
      blocks: [{ id: 'question-1', type: 'question', settings: { question: 'Как стирать?' } }],
    };
    const renderer = startSectionRenderer();
    opened.push(renderer);
    const build = await renderer.render({ ...request, preview: false });
    const preview = await renderer.render({ ...request, preview: true });
    expect(build).not.toMatch(/data-merfy-(?:edit|placeholder)/);
    expect(preview).toContain('data-merfy-edit="heading"');
    expect(preview).toContain('data-merfy-edit-html="text"');
    expect(preview).toContain('data-merfy-edit="blocks/question-1/question"');
    const first = /data-merfy-placeholder="([^"]*)"/.exec(preview)?.[1] ?? '';
    expect(first.replaceAll('&quot;', '"').replaceAll('&#34;', '"')).toBe(LABEL);
    expect(strip(preview)).toBe(build);
  }, 30_000);
});
