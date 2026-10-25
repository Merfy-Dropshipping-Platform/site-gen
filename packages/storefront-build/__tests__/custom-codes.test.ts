import { describe, expect, it } from 'vitest';
import { customCodesOf } from '../src/custom-codes';
import type { Entity } from '../src/inputs';
import { errorOf, standInputs } from './support';

const AT = '1970-01-01T00:00:00.000Z';
const code = (id: string, data: Record<string, string>): Entity => ({ type: 'custom-code', id, updatedAt: AT, data });

describe('customCodesOf (блок 13 «Секций и SDK», часть 13б)', () => {
  it('порядок — по id пикселя, другие сущности — мимо', () => {
    const entities = [
      code('p-2', { code: '<script>b()</script>', consent: 'none' }),
      ...standInputs.data.entities,
      code('p-1', { code: '<script>a()</script>', consent: 'required' }),
    ];
    expect(customCodesOf(entities)).toEqual([
      { code: '<script>a()</script>', consent: 'required' },
      { code: '<script>b()</script>', consent: 'none' },
    ]);
  });

  it('«своего кода» нет — пустой список', () => {
    expect(customCodesOf(standInputs.data.entities)).toEqual([]);
  });

  it.each<[string, Record<string, string>]>([
    ['пустой код', { code: '', consent: 'none' }],
    ['отметка не из двух', { code: '<script>a()</script>', consent: 'soon' }],
    ['лишнее поле', { code: '<script>a()</script>', consent: 'none', name: 'Чат' }],
  ])('%s — inputs-invalid с путём сущности', (_title, data) => {
    const error = errorOf(() => customCodesOf([code('p-1', data)]));
    expect([error.code, error.path]).toEqual(['inputs-invalid', 'data.entities.0.data']);
  });
});
