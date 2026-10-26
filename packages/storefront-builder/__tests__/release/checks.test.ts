import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../../src/errors';
import { parseCheckJob, parseCheckResult } from '../../src/release/checks';

function failure(run: () => unknown): StorefrontBuilderError {
  try {
    run();
  } catch (error) {
    if (error instanceof StorefrontBuilderError) return error;
    throw error;
  }
  throw new Error('ожидали ошибку');
}

const RESULT = { v: 1, release: 3, siteId: 's1', phase: 'after', passport: null, differences: [] };

describe('сообщения проверяющего процесса', () => {
  it('задание «после» несёт паспорт «до»', () => {
    const job = parseCheckJob({
      v: 1,
      release: 3,
      siteId: 's1',
      phase: 'after',
      url: 'https://a.dev.merfy.ru',
      before: { errors: [] },
    });
    expect(job.before).toEqual({ errors: [] });
  });

  it('задание «после» несёт ожидание новой сборки — отпечаток файла главной', () => {
    const job = parseCheckJob({
      v: 1,
      release: 3,
      siteId: 's1',
      phase: 'after',
      url: 'https://a.dev.merfy.ru',
      before: { errors: [] },
      expected: { home: 'd'.repeat(64) },
    });
    expect(job.expected).toEqual({ home: 'd'.repeat(64) });
    expect(() =>
      parseCheckJob({
        v: 1,
        release: 3,
        siteId: 's1',
        phase: 'after',
        url: 'https://a.dev.merfy.ru',
        before: {},
        expected: {},
      }),
    ).toThrow(StorefrontBuilderError);
  });

  it('ответ с вердиктом и ответ с ошибкой — оба по схеме', () => {
    expect(parseCheckResult({ ...RESULT, verdict: 'red', error: null }).verdict).toBe('red');
    expect(parseCheckResult({ ...RESULT, verdict: null, error: 'страница ответила 503' }).error).toBe(
      'страница ответила 503',
    );
  });

  it('чужое сообщение — message-invalid с именем очереди', () => {
    const error = failure(() => parseCheckResult({ v: 2 }));
    expect(error.code).toBe('message-invalid');
    expect(error.message).toContain('storefront_check_results');
  });
});
