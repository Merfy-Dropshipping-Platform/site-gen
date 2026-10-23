import { describe, expect, it } from 'vitest';
import { valuePosition } from '../src/position';

const TEXT = [
  '{',
  '  "settings": [',
  '    { "id": "coatColor", "label": "Цвет" },',
  '    { "id": "heading" }',
  '  ]',
  '}',
].join('\n');

describe('место значения в section.json', () => {
  it('строка и колонка начала значения по пути', () => {
    expect(valuePosition(TEXT, ['settings'])).toEqual({ line: 2, column: 15 });
    expect(valuePosition(TEXT, ['settings', 0, 'id'])).toEqual({ line: 3, column: 13 });
    expect(valuePosition(TEXT, ['settings', 1])).toEqual({ line: 4, column: 5 });
  });

  it('пути нет или текст не JSON — места нет', () => {
    expect(valuePosition(TEXT, ['settings', 5, 'id'])).toBeUndefined();
    expect(valuePosition('не JSON', ['settings'])).toBeUndefined();
  });
});
