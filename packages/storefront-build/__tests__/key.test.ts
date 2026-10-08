import { describe, expect, it } from 'vitest';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { buildKey } from '../src/key';
import { changedInputs, standInputs } from './support';

const OTHER_HASH = `sha256:${'f'.repeat(64)}`;

// Правка каждого листа входов (design.md блока 4, В4-3 Б): путь листа → правка. Тест ниже сверяет таблицу с листьями
// входов стенда — новый вход без строки здесь тест не пропустит.
const EDITS: Record<string, (inputs: BuildInputs) => void> = {
  'platform.renderHash': (inputs) => (inputs.platform.renderHash = OTHER_HASH),
  'theme.id': (inputs) => (inputs.theme.id = 'nova-next'),
  'theme.version': (inputs) => (inputs.theme.version = '0.0.2'),
  'theme.contentHash': (inputs) => (inputs.theme.contentHash = OTHER_HASH),
  shell: (inputs) => (inputs.shell = { version: '0.1.0' }),
  'revision.tokens': (inputs) => (inputs.revision.tokens = { root: { 'radius-button': 6 } }),
  'site.id': (inputs) => (inputs.site.id = '00000000-0000-4000-8000-000000000002'),
  'site.name': (inputs) => (inputs.site.name = 'Стенд Nova 2'),
  'site.publicUrl': (inputs) => (inputs.site.publicUrl = 'https://nova-next.example'),
  'site.description': (inputs) => (inputs.site.description = 'Другое описание'),
  'site.updatedAt': (inputs) => (inputs.site.updatedAt = '2026-10-06T10:00:00.000Z'),
  'env.apiUrl': (inputs) => (inputs.env.apiUrl = 'http://localhost:4322/api'),
  year: (inputs) => (inputs.year = 2027),
  'data.entities': (inputs) => (inputs.data.entities[0].data.price = 2300),
};
// Признак «получен» — не вход ключа: без него сборки нет вовсе (data-not-received).
const NOT_KEY = new Set(['data.status']);
// Открытый JSON: любая правка внутри — правка одного входа.
const OPEN_JSON = new Set(['revision.tokens', 'data.entities']);

function leafPaths(value: unknown, path = ''): string[] {
  if (OPEN_JSON.has(path) || typeof value !== 'object' || value === null) return [path];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, path === '' ? key : `${path}.${key}`));
}

describe('buildKey', () => {
  it('одинаковые входы — один ключ в формате sha256', () => {
    expect(buildKey(structuredClone(standInputs))).toBe(buildKey(standInputs));
    expect(buildKey(standInputs)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('таблица правок покрывает каждый лист входов', () => {
    const leaves = leafPaths(standInputs).filter((path) => !NOT_KEY.has(path));
    expect(Object.keys(EDITS).sort()).toEqual(leaves.sort());
  });

  it.each(Object.keys(EDITS))('правка %s меняет ключ', (path) => {
    const changed = changedInputs(EDITS[path]);
    expect(parseBuildInputs(changed)).toEqual(changed);
    expect(buildKey(changed)).not.toBe(buildKey(standInputs));
  });

  it('снимок данных в другом порядке — тот же ключ', () => {
    expect(buildKey(changedInputs((inputs) => inputs.data.entities.reverse()))).toBe(buildKey(standInputs));
  });

  it('добавили или убрали сущность — ключ другой', () => {
    const added = changedInputs((inputs) =>
      inputs.data.entities.push({ ...inputs.data.entities[0], id: '00000000-0000-4000-8000-000000000103' }),
    );
    const removed = changedInputs((inputs) => inputs.data.entities.pop());
    expect(buildKey(added)).not.toBe(buildKey(standInputs));
    expect(buildKey(removed)).not.toBe(buildKey(standInputs));
  });
});
