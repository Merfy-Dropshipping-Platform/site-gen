import { describe, expect, it } from 'vitest';
import { resolveSectionBlocks } from '../src/blocks';
import { readManifest } from '../src/format';

// Блоки секции (блок 1 «Секций и SDK», часть 3, п. 18, Р53–Р55): типы в section.json, блоки экземпляра — в ревизии.
const QUESTION = {
  title: 'Вопрос',
  limit: 3,
  settings: [
    { id: 'question', label: 'Вопрос', setting: { kind: 'string', default: 'Новый вопрос' } },
    { id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } },
  ],
};
const FAQ = {
  sdk: 1,
  name: 'faq',
  kind: 'section',
  title: 'Вопросы и ответы',
  settings: [{ id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Вопросы и ответы' } }],
  blocks: { question: QUESTION },
  defaultBlocks: [
    { type: 'question', settings: { question: 'Как стирать кашемир?', answer: '<p>Руками, в прохладной воде.</p>' } },
    { type: 'question', settings: {} },
  ],
};
const filesOf = (manifest: unknown) => ({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const read = readManifest(filesOf(manifest));
  return read.ok ? [] : read.problems.map((item) => `${item.code} ${item.message}`).sort();
};
const faqManifest = () => {
  const read = readManifest(filesOf(FAQ));
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  return read.value;
};

describe('blocks и defaultBlocks в section.json', () => {
  it('секция с блоками и richtext проходит; без blocks — как в части 1', () => {
    expect(faqManifest().blocks?.question?.limit).toBe(3);
    expect(problemsOf({ ...FAQ, blocks: undefined, defaultBlocks: undefined })).toEqual([]);
  });

  it('имя типа, тип и число блоков по умолчанию, значения — с путём', () => {
    const broken = {
      ...FAQ,
      blocks: { question: QUESTION, Bad_Type: { title: 'Плохой', limit: 1, settings: [] } },
      defaultBlocks: [
        { type: 'question', settings: { question: 'x'.repeat(201), colour: 'red' } },
        { type: 'answer', settings: {} },
        { type: 'question', settings: {} },
        { type: 'question', settings: {} },
        { type: 'question', settings: {} },
      ],
    };
    expect(problemsOf(broken)).toEqual(
      [
        'manifest-invalid blocks.Bad_Type: тип блока — строчные латинские буквы и цифры через одиночный дефис, с буквы, до 30 знаков',
        'manifest-invalid defaultBlocks.1.type: типа answer в blocks нет',
        'manifest-invalid defaultBlocks: блоков question — 4, limit 3',
        'setting-invalid defaultBlocks.0.settings.colour: такой настройки у секции нет',
        'setting-invalid defaultBlocks.0.settings.question: нужно строка до 200 знаков',
      ].sort(),
    );
  });

  it('defaultBlocks без blocks; повтор поля в типе; limit вне 1–50', () => {
    expect(problemsOf({ ...FAQ, blocks: undefined })).toEqual(['manifest-invalid defaultBlocks: у секции нет blocks']);
    const twice = { ...QUESTION, settings: [QUESTION.settings[0], QUESTION.settings[0]] };
    expect(problemsOf({ ...FAQ, blocks: { question: twice }, defaultBlocks: [] })).toEqual([
      'setting-invalid blocks.question.settings.1.id: question уже есть',
    ]);
    const wide = problemsOf({ ...FAQ, blocks: { question: { ...QUESTION, limit: 51 } }, defaultBlocks: [] });
    expect(wide.map((text) => text.split(':')[0])).toEqual(['manifest-invalid blocks.question.limit']);
  });
});

describe('блоки экземпляра', () => {
  it('нет ключа blocks — блоки по умолчанию с id <тип>-<n>, значения поверх умолчаний типа', () => {
    expect(resolveSectionBlocks(faqManifest(), undefined)).toEqual({
      blocks: [
        {
          id: 'question-1',
          type: 'question',
          settings: { question: 'Как стирать кашемир?', answer: '<p>Руками, в прохладной воде.</p>' },
        },
        { id: 'question-2', type: 'question', settings: { question: 'Новый вопрос', answer: '<p>Ответ</p>' } },
      ],
      invalid: [],
    });
    expect(resolveSectionBlocks(faqManifest(), [])).toEqual({ blocks: [], invalid: [] });
  });

  it('скрытый — не показан; повтор id, неизвестный тип и неверное значение — в invalid; richtext очищен', () => {
    const edits = [
      { id: 'question-a', type: 'question', settings: { answer: '<p onclick="x()">Да</p>' } },
      { id: 'question-b', type: 'question', settings: {}, hidden: true },
      { id: 'question-a', type: 'question', settings: {} },
      { id: 'slide-1', type: 'slide', settings: {} },
      { id: 'question-c', type: 'question', settings: { question: 5 } },
      { id: 'x-1', type: 'constructor', settings: {} },
    ];
    expect(resolveSectionBlocks(faqManifest(), edits)).toEqual({
      blocks: [
        { id: 'question-a', type: 'question', settings: { question: 'Новый вопрос', answer: '<p>Да</p>' } },
        { id: 'question-c', type: 'question', settings: { question: 'Новый вопрос', answer: '<p>Ответ</p>' } },
      ],
      invalid: [
        'blocks.2.id: question-a уже есть',
        'blocks.3.type: типа slide у секции нет',
        'blocks.4.settings.question: нужно строка до 200 знаков',
        'blocks.5.type: типа constructor у секции нет',
      ],
    });
  });

  it('сверх limit — по порядку, скрытые считаются', () => {
    const edits = ['a', 'b', 'c', 'd'].map((letter, index) => ({
      id: `question-${letter}`,
      type: 'question',
      settings: {},
      ...(index === 0 ? { hidden: true } : {}),
    }));
    const resolved = resolveSectionBlocks(faqManifest(), edits);
    expect(resolved.blocks.map((block) => block.id)).toEqual(['question-b', 'question-c']);
    expect(resolved.invalid).toEqual(['blocks.3: блоков question больше 3']);
  });

  it('у секции без blocks — блоков нет; список в ревизии — в invalid', () => {
    expect(resolveSectionBlocks({}, undefined)).toEqual({ blocks: [], invalid: [] });
    expect(resolveSectionBlocks({}, [{ id: 'question-1', type: 'question', settings: {} }])).toEqual({
      blocks: [],
      invalid: ['blocks: у секции нет блоков'],
    });
  });
});
