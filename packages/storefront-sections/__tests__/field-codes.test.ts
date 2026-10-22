import { describe, expect, it } from 'vitest';
import { PROBLEM_CODES, isWarning, problem } from '../src/problems';

const FIELD_CODES = [
  'setting-name-unknown',
  'setting-name-kind',
  'settings-limit',
  'visible-when-invalid',
  'render-empty-failed',
] as const;

describe('коды правил полей (блок 3 «Секций и SDK», раздел 3.9)', () => {
  it('пять кодов — в общем списке, в этом порядке', () => {
    expect(PROBLEM_CODES.filter((code) => FIELD_CODES.some((own) => own === code))).toEqual([...FIELD_CODES]);
  });

  it('все пять — отказы, не предупреждения', () => {
    expect(FIELD_CODES.filter((code) => isWarning(problem(code, 'section.json', 'текст')))).toEqual([]);
  });
});
