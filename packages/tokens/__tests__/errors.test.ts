import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from '../src/errors';

describe('TokenError', () => {
  it('пишет все проблемы в текст, по строке на каждую', () => {
    const error = new TokenError('theme-invalid', ['root.a: нужно x', 'root.b: нужно y']);
    expect(error.message).toBe('root.a: нужно x\nroot.b: нужно y');
    expect(error.code).toBe('theme-invalid');
    expect(error.problems).toEqual(['root.a: нужно x', 'root.b: нужно y']);
    expect(error.name).toBe('TokenError');
  });

  it('throwIfProblems молчит без проблем и бросает TokenError с кодом при проблемах', () => {
    expect(() => throwIfProblems('edits-invalid', [])).not.toThrow();
    expect(() => throwIfProblems('edits-invalid', ['schemes.scheme-3: такой схемы нет в теме'])).toThrow(TokenError);
  });
});

describe('shapeProblems', () => {
  it('называет путь к полю и пишет по-русски', () => {
    const result = z.object({ root: z.record(z.string(), z.unknown()) }).safeParse({ root: 5 }, RUSSIAN_ERRORS);
    expect(result.success).toBe(false);
    const problems = result.success ? [] : shapeProblems(result.error, 'tokens');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^tokens\.root: /);
    expect(problems[0]).toMatch(/[а-я]/);
  });
});
