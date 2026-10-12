import { normalizePassport, type Collected } from '@merfy/stand-check';
import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { checkShop, readCheckerSettings, type CheckerDeps } from '../src/checker/check';

// Проверка магазина без браузера: «открыть страницу» подставная, правила — те, что в release-rules.json.
const PASSPORT = normalizePassport({
  version: 1,
  page: '/',
  target: 'dev',
  scripts: [{ src: '/_astro/shell.*.js', kind: 'module', bytes: 9216, hash: '3f9a2c1e' }],
  globals: {},
  storage: [],
  cookies: [],
  requests: [{ url: '/_astro/shell.*.js', status: 200 }],
  errors: [],
  tokens: { '--primary': '#111111' },
  fonts: ['Onest 400 normal'],
});
const RULES: CheckerDeps['rules'] = [
  { field: 'errors', shape: 'set', severity: { added: 'red', removed: 'amber' }, reason: { all: 'ошибка' } },
  {
    field: 'tokens',
    shape: 'map',
    severity: { added: 'amber', removed: 'red', changed: 'amber' },
    reason: { all: 'вид' },
  },
];
const JOB = { v: 1 as const, release: 4, siteId: 's1', url: 'https://a.dev.merfy.ru' };

const opening = (collected: Collected) => (): Promise<Collected> => Promise.resolve(collected);
const depsWith = (open: CheckerDeps['open']): CheckerDeps => ({ open, rules: RULES, log: () => undefined });

describe('проверка магазина (блок 10)', () => {
  it('«до» — паспорт без сравнения', async () => {
    const result = await checkShop(depsWith(opening({ passport: PASSPORT, sections: [] })), {
      ...JOB,
      phase: 'before',
    });
    expect(result).toMatchObject({ phase: 'before', verdict: null, differences: [], error: null });
    expect(result.passport).toEqual(PASSPORT);
  });

  it('«после» с новой ошибкой — красный; другой цвет — жёлтый', async () => {
    const failing = { ...PASSPORT, errors: ['TypeError: cart is undefined'] };
    const red = await checkShop(depsWith(opening({ passport: failing, sections: [] })), {
      ...JOB,
      phase: 'after',
      before: PASSPORT,
    });
    expect(red.verdict).toBe('red');
    const restyled = { ...PASSPORT, tokens: { '--primary': '#222222' } };
    const amber = await checkShop(depsWith(opening({ passport: restyled, sections: [] })), {
      ...JOB,
      phase: 'after',
      before: PASSPORT,
    });
    expect(amber.verdict).toBe('amber');
  });

  it('страница не открылась — ошибка в ответе, а не исключение', async () => {
    const result = await checkShop(
      depsWith(() => Promise.reject(new Error('https://a.dev.merfy.ru ответил 503'))),
      { ...JOB, phase: 'after', before: PASSPORT },
    );
    expect(result).toMatchObject({ passport: null, verdict: null, error: 'https://a.dev.merfy.ru ответил 503' });
  });

  it('настройки: порт по умолчанию 8080; без RABBITMQ_URL — settings-invalid', () => {
    expect(readCheckerSettings({ RABBITMQ_URL: 'amqp://stand' })).toEqual({ rabbitmqUrl: 'amqp://stand', port: 8080 });
    expect(() => readCheckerSettings({})).toThrow(StorefrontBuilderError);
  });
});
