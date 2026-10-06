import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import answersJson from '../fixtures/tool-answers.json';
import { createTokensTool, runTokensTool, tokensTool } from '../src/tool/tool';
import type { TokenEdits, TokenHost, TokenState } from '../src/types';
import { sample } from './support';

// Ответы инструмента на образце магазина — дословно, как у прототипа (design.md 8.8).
const ANSWERS = z.record(z.string(), z.string()).parse(answersJson);
const STATE: TokenState = { dictionary: sample.dictionary, theme: sample.tokens, edits: {} };
const GREEN = { schemes: { 'scheme-1': { primary: '#16a34a' }, 'scheme-2': { primary: '#22c55e' } } };
const FG = { schemes: { 'scheme-1': { foreground: '#e5e5e5' } } };

// Хозяин правок в памяти — как черновик редактора в конструкторе. saved — что инструмент ему отдал.
function memoryHost(state: TokenState): { host: TokenHost; saved: TokenEdits[] } {
  let current = state;
  const saved: TokenEdits[] = [];
  const host: TokenHost = {
    load: () => Promise.resolve(current),
    save: (edits) => {
      current = { ...current, edits };
      saved.push(edits);
      return Promise.resolve();
    },
  };
  return { host, saved };
}

type Step = [string, unknown];
type Flow = { title: string; steps: Step[] };
// Четыре потока; каждый — свой хозяин правок, шаги идут по порядку.
const FLOWS: Flow[] = [
  {
    title: 'кнопки круглее',
    steps: [
      ['find-radius', { action: 'find', query: 'скругление кнопок' }],
      ['describe-radius', { action: 'describe', name: 'radius-button' }],
      ['check-round', { action: 'check', edits: { root: { 'radius-button': 16 } } }],
    ],
  },
  {
    title: 'кнопки зелёные и всё остальное',
    steps: [
      ['find-button-color', { action: 'find', query: 'цвет кнопки' }],
      ['describe-primary', { action: 'describe', name: 'primary' }],
      ['check-green', { action: 'check', edits: GREEN }],
      ['set-green', { action: 'set', edits: GREEN }],
      ['find-cart-type', { action: 'find', query: 'вид корзины' }],
      ['find-link-color', { action: 'find', query: 'цвет ссылок' }],
      ['check-grid', { action: 'check', edits: { root: { 'choice-card-style': 'grid' } } }],
      ['set-grid', { action: 'set', edits: { root: { 'choice-card-style': 'grid' } } }],
      ['groups', { action: 'groups' }],
      ['list-cards', { action: 'list', group: 'cards' }],
      ['list-nope', { action: 'list', group: 'nope' }],
      ['describe-nope', { action: 'describe', name: 'nope' }],
      ['find-empty-kind', { action: 'find', query: 'хочу' }],
      ['find-typo', { action: 'find', query: 'скругленее кнопок' }],
      ['find-playfair', { action: 'find', query: 'поменяй шрифт на Playfair' }],
      ['find-color', { action: 'find', query: 'цвет' }],
      ['find-shadow', { action: 'find', query: 'тень' }],
      ['find-gradient-btn', { action: 'find', query: 'кнопка с градиентом' }],
      ['no-field', { action: 'find' }],
      ['no-action', { action: 'paint' }],
    ],
  },
  {
    title: 'хозяин помнит правку',
    steps: [
      ['set-round', { action: 'set', edits: { root: { 'radius-button': 16 } } }],
      ['describe-after-set', { action: 'describe', name: 'radius-button' }],
    ],
  },
  {
    title: 'светлый текст и карточки',
    steps: [
      ['check-same', { action: 'check', edits: { root: { 'radius-button': 8 } } }],
      ['check-fg', { action: 'check', edits: FG }],
      ['set-fg', { action: 'set', edits: FG }],
      ['describe-shadow-popover', { action: 'describe', name: 'shadow-popover' }],
      ['describe-scheme-card', { action: 'describe', name: 'scheme-card' }],
      ['describe-text-2xl', { action: 'describe', name: 'text-2xl' }],
    ],
  },
];

describe('ответы дословно', () => {
  it.each(FLOWS)('поток «$title»', async ({ steps }) => {
    const tool = createTokensTool(memoryHost(STATE).host);
    for (const [key, input] of steps) expect(await tool.call(input), key).toBe(ANSWERS[key]);
  });

  it('описание и входная схема — как у прототипа: шесть действий, reset нет', () => {
    expect(JSON.stringify(tokensTool)).toBe(ANSWERS['tool-json']);
    expect(tokensTool.description).toBe(ANSWERS['tool-description']);
    expect(tokensTool.inputSchema).toMatchObject({
      properties: { action: { enum: ['find', 'describe', 'check', 'set', 'groups', 'list'] } },
    });
    expect(JSON.stringify(tokensTool)).not.toContain('reset');
  });
});

describe('вход: адресный ответ вместо исключения', () => {
  it.each<[string, unknown, string]>([
    ['нет поля', { action: 'find' }, 'find: нужно поле query.'],
    ['пустой запрос', { action: 'find', query: '   ' }, 'find: нужно поле query.'],
    ['правки не объект', { action: 'check', edits: [] }, 'check: нужно поле edits.'],
    ['имя не строка', { action: 'describe', name: 5 }, 'describe: нужно поле name.'],
    ['чужое действие', { action: 'paint' }, 'Действия paint нет. Есть: find, describe, check, set, groups, list.'],
    [
      'снять правку нельзя',
      { action: 'reset', names: ['radius-button'] },
      'Действия reset нет. Есть: find, describe, check, set, groups, list.',
    ],
    ['вход не объект', 'find', 'Действия undefined нет. Есть: find, describe, check, set, groups, list.'],
  ])('%s', (_title, input, text) => {
    expect(runTokensTool(STATE, input)).toEqual({ text });
  });

  it('ошибка формы правок называет поле', () => {
    expect(runTokensTool(STATE, { action: 'check', edits: { root: 5 } }).text).toMatch(/^Не годится:\nedits\.root: /);
  });
});

describe('правки и хозяин', () => {
  it('новые правки возвращает только set, и только без ошибок', () => {
    const edits = { root: { 'radius-button': 16 } };
    expect(runTokensTool(STATE, { action: 'set', edits })).toEqual({
      text: 'Записано: 1, вслед пересчитано 2.',
      edits: { root: { 'radius-button': 16 }, schemes: {} },
    });
    expect(runTokensTool(STATE, { action: 'check', edits }).edits).toBeUndefined();
    expect(runTokensTool(STATE, { action: 'set', edits: { root: { 'radius-button': -1 } } }).edits).toBeUndefined();
  });

  it('хозяин получает правки после set, следующий describe видит правку', async () => {
    const { host, saved } = memoryHost(STATE);
    const tool = createTokensTool(host);
    await tool.call({ action: 'set', edits: { root: { 'radius-button': 16 } } });
    expect(saved).toEqual([{ root: { 'radius-button': 16 }, schemes: {} }]);
    expect(await tool.call({ action: 'describe', name: 'radius-button' })).toContain('Сейчас: 16 px (правка).');
  });

  it('check хозяину ничего не отдаёт', async () => {
    const { host, saved } = memoryHost(STATE);
    await createTokensTool(host).call({ action: 'check', edits: GREEN });
    expect(saved).toEqual([]);
  });
});

describe('пакет ничего не знает про ИИ', () => {
  it('src импортирует только zod и свои файлы: ни библиотек ИИ, ни node: — работает и в браузере', () => {
    const dir = new URL('../src/', import.meta.url);
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'));
    const sources = files.flatMap((file) =>
      [...readFileSync(new URL(file, dir), 'utf8').matchAll(/from '([^']+)'/g)].map((match) => match[1]),
    );
    expect(files.length).toBeGreaterThan(10);
    expect(sources.filter((source) => !source.startsWith('.') && source !== 'zod')).toEqual([]);
  });
});
