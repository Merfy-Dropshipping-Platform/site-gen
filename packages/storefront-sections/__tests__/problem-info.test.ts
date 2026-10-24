import { describe, expect, it } from 'vitest';
import { PROBLEM_INFO, problemDoc } from '../src/problem-info';
import { PROBLEM_CODES } from '../src/problems';

// Справка по кодам проверки (блок 14 «Секций и SDK», 14.6): у каждого кода — когда и как исправить; лишних нет.
describe('справка по кодам', () => {
  it('у каждого кода есть справка, справок без кода нет', () => {
    expect(Object.keys(PROBLEM_INFO).sort()).toEqual([...PROBLEM_CODES].sort());
  });

  it.each([...PROBLEM_CODES])('%s: when и fix — одно предложение по-русски, с точкой', (code) => {
    const info = PROBLEM_INFO[code];
    for (const text of [info.when, info.fix]) {
      expect(text).toMatch(/^[А-ЯЁA-Z`«<]/);
      expect(text.endsWith('.')).toBe(true);
      expect(text.includes('\n')).toBe(false);
      expect(text.length).toBeLessThanOrEqual(240);
    }
  });

  it('пример — две разные строки без перевода строки', () => {
    for (const info of Object.values(PROBLEM_INFO)) {
      if (info.example === undefined) continue;
      expect(info.example.before).not.toBe(info.example.after);
      expect(`${info.example.before}${info.example.after}`.includes('\n')).toBe(false);
    }
  });

  it('ссылка на справку — страница errors.md и якорь-код', () => {
    expect(problemDoc('setting-name-unknown')).toBe('errors.md#setting-name-unknown');
  });
});
