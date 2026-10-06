import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StandError, parseWith } from '../src/errors';

describe('StandError', () => {
  it('несёт код и называет его в тексте', () => {
    const error = new StandError('passport-invalid', 'нет поля page');
    expect(error.code).toBe('passport-invalid');
    expect(error.message).toBe('passport-invalid: нет поля page');
    expect(error.name).toBe('StandError');
  });

  it('хранит исходную ошибку в cause', () => {
    const cause = new Error('исходная');
    expect(new StandError('file-unreadable', 'a.json', { cause }).cause).toBe(cause);
  });
});

describe('parseWith', () => {
  const schema = z.object({ page: z.string(), storage: z.array(z.string()) }).strict();

  it('возвращает проверенные данные', () => {
    const passport = parseWith(schema, { page: '/x', storage: [] }, 'passport-invalid', 'паспорт');
    expect(passport).toEqual({ page: '/x', storage: [] });
  });

  it('ошибка называет каждое поле с проблемой', () => {
    const run = () => parseWith(schema, { page: 1, storage: [{ key: 'a' }] }, 'passport-invalid', 'паспорт');
    expect(run).toThrow(StandError);
    expect(run).toThrow(/паспорт:\npage: .*\nstorage\.0: /);
  });

  it('проблему в корне подписывает словом «корень»', () => {
    expect(() => parseWith(schema, 'не объект', 'passport-invalid', 'паспорт')).toThrow(/\(корень\): /);
  });
});
