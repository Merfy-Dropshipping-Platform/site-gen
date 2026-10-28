import { normalizePassport, type Collected } from '@merfy/stand-check';
import { describe, expect, it } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { checkShop, openWithCheckout, readCheckerSettings, type CheckerDeps } from '../src/checker/check';

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
const depsWith = (open: CheckerDeps['open'], fetch?: CheckerDeps['fetch']): CheckerDeps => ({
  open,
  rules: RULES,
  log: () => undefined,
  fetch: fetch ?? (() => Promise.resolve(new Response('', { status: 200 }))),
  homePollMs: 0,
  homeWaitMs: 5_000,
});

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
    expect(readCheckerSettings({ RABBITMQ_URL: 'amqp://stand' })).toEqual({
      rabbitmqUrl: 'amqp://stand',
      port: 8080,
      sitesUrl: null,
    });
    expect(() => readCheckerSettings({})).toThrow(StorefrontBuilderError);
  });
});

// Гонка раздачи выпуска платформы №77 (26.10): указатель кэшируется ~1 с, паспорт «после» снимался со старого HTML —
// его бандла нет в новой таблице раздачи, 404 объявлялся «новой ошибкой в консоли» и красным. Теперь паспорт снимается
// только с новой сборки: признак — ETag главной равен отпечатку файла главной из манифеста живой сборки.
describe('паспорт «после» снимается с новой сборки (гонка раздачи, выпуск №77)', () => {
  const OLD_HOME = '1'.repeat(64);
  const NEW_HOME = '2'.repeat(64);
  const etagOf = (hex: string): Response => new Response('', { status: 200, headers: { ETag: `"${hex}"` } });

  const PASSPORT_NEW = normalizePassport({
    ...PASSPORT,
    scripts: [{ src: '/_merfy/b/new.js', kind: 'module', bytes: 9216, hash: '3f9a2c1e' }],
  });

  it('раздача первые опросы отдаёт старую главную — ждём совпадения ETag, потом снимаем паспорт; не красный', async () => {
    const etags = [OLD_HOME, OLD_HOME, NEW_HOME];
    const asked: string[] = [];
    const fetch = (url: string): Promise<Response> => {
      asked.push(url);
      return Promise.resolve(etagOf(etags.shift() ?? NEW_HOME));
    };
    let opened = 0;
    const open = (): Promise<Collected> => {
      opened += 1;
      return Promise.resolve({ passport: PASSPORT_NEW, sections: [] });
    };
    const result = await checkShop(depsWith(open, fetch), {
      ...JOB,
      phase: 'after',
      before: PASSPORT,
      expected: { home: NEW_HOME },
    });
    expect(asked).toEqual([`${JOB.url}/`, `${JOB.url}/`, `${JOB.url}/`]);
    expect(opened).toBe(1);
    expect(result).toMatchObject({ verdict: 'clean', error: null });
  });

  it('новая сборка не пришла за предел — ошибка ожидания с понятным текстом, страница не открывается', async () => {
    let opened = 0;
    const open = (): Promise<Collected> => {
      opened += 1;
      return Promise.resolve({ passport: PASSPORT, sections: [] });
    };
    const result = await checkShop(
      { ...depsWith(open, () => Promise.resolve(etagOf(OLD_HOME))), homeWaitMs: 20 },
      { ...JOB, phase: 'after', before: PASSPORT, expected: { home: NEW_HOME } },
    );
    expect(opened).toBe(0);
    expect(result.passport).toBeNull();
    expect(result.verdict).toBeNull();
    expect(result.error).toContain('раздача не сменила главную на новую сборку');
    expect(result.error).toContain(`ждали "${NEW_HOME}"`);
  });

  it('задание без ожидания (проверка «до», старый ведущий) — страницу открываем сразу', async () => {
    let opened = 0;
    const open = (): Promise<Collected> => {
      opened += 1;
      return Promise.resolve({ passport: PASSPORT, sections: [] });
    };
    await checkShop(
      depsWith(open, () => Promise.reject(new Error('не должна зваться'))),
      {
        ...JOB,
        phase: 'after',
        before: PASSPORT,
      },
    );
    expect(opened).toBe(1);
  });
});

// Ошибки страницы оформления в паспорте главной (выпуск nova 0.7.1 №69: pageerror /checkout не дал красного).
describe('ошибки страницы оформления', () => {
  const passportAt = (path: string, errors: readonly string[]): Collected => ({
    passport: normalizePassport({ ...PASSPORT, page: path, errors: [...errors] }),
    sections: [],
  });
  const opened: string[] = [];
  const open = (url: string): Promise<Collected> => {
    opened.push(url);
    const path = new URL(url).pathname;
    if (path === '/checkout')
      return Promise.resolve(passportAt('/checkout', ['TypeError: window.__merfyRoot is not a function']));
    return Promise.resolve(passportAt('/', []));
  };

  it('ошибки /checkout добавляются к паспорту главной; страница оформления открыта по своему адресу', async () => {
    const merged = await openWithCheckout(open, 'https://a.dev.merfy.ru');
    expect(opened.map((url) => new URL(url).pathname)).toEqual(['/', '/checkout']);
    expect(merged.passport.errors).toEqual(['TypeError: window.__merfyRoot is not a function']);
    expect(merged.passport.page).toBe('/');
  });

  it('новая ошибка оформления в «после» — красный', async () => {
    const red = await checkShop(
      {
        open: (url) => openWithCheckout(open, url),
        rules: RULES,
        log: () => undefined,
        fetch: () => Promise.resolve(new Response('', { status: 200 })),
        homePollMs: 0,
        homeWaitMs: 5_000,
      },
      { ...JOB, phase: 'after', before: passportAt('/', []).passport },
    );
    expect(red.verdict).toBe('red');
  });

  it('страница оформления ушла редиректом или не открылась — паспорт главной без изменений', async () => {
    const redirected = await openWithCheckout(
      (url) =>
        new URL(url).pathname === '/checkout' ? Promise.resolve(passportAt('/login', ['ошибка входа'])) : open(url),
      'https://a.dev.merfy.ru',
    );
    expect(redirected.passport.errors).toEqual([]);
    const unavailable = await openWithCheckout(
      (url) => (new URL(url).pathname === '/checkout' ? Promise.reject(new Error('нет страницы')) : open(url)),
      'https://a.dev.merfy.ru',
    );
    expect(unavailable.passport.errors).toEqual([]);
  });
});
