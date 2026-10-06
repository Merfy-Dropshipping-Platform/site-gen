import { describe, expect, it } from 'vitest';
import { StandError } from '../src/errors';
import { normalizePassport } from '../src/passport/normalize';
import type { Passport } from '../src/types';

const rawPassport = (overrides: Partial<Passport> = {}): Passport => ({
  version: 1,
  page: '/theme-stand',
  target: 'local',
  scripts: [],
  globals: {},
  storage: [],
  cookies: [],
  requests: [],
  errors: [],
  tokens: {},
  fonts: [],
  ...overrides,
});

describe('normalizePassport: скрипты', () => {
  it('хэш в имени уходит в поле hash, ключ — shell.*.js', () => {
    const scripts = [{ src: '/_astro/shell.3f9a2c1e.js', kind: 'module' as const, bytes: 9216 }];
    expect(normalizePassport(rawPassport({ scripts })).scripts).toEqual([
      { src: '/_astro/shell.*.js', kind: 'module', bytes: 9216, hash: '3f9a2c1e' },
    ]);
  });

  it('хэш Vite из букв, цифр и «_» тоже уходит в hash', () => {
    const scripts = [{ src: '/_astro/index.BvX9a_2k.js', kind: 'module' as const, bytes: 10 }];
    expect(normalizePassport(rawPassport({ scripts })).scripts[0]).toMatchObject({
      src: '/_astro/index.*.js',
      hash: 'BvX9a_2k',
    });
  });

  it('имя без хэша не меняется: jquery.extended.js', () => {
    const scripts = [{ src: '/vendor/jquery.extended.js', kind: 'external' as const, bytes: 10 }];
    expect(normalizePassport(rawPassport({ scripts })).scripts).toEqual(scripts);
  });

  it('?v= у адреса убирается, другие параметры остаются', () => {
    const scripts = [{ src: '/widget.js?v=17&lang=ru', kind: 'external' as const, bytes: 10 }];
    expect(normalizePassport(rawPassport({ scripts })).scripts[0].src).toBe('/widget.js?lang=ru');
  });
});

describe('normalizePassport: запросы и ошибки', () => {
  it('у запроса хэш и ?v= убираются, хэш не хранится', () => {
    const requests = [{ url: '/_astro/shell.3f9a2c1e.js?v=2', status: 200 }];
    expect(normalizePassport(rawPassport({ requests })).requests).toEqual([{ url: '/_astro/shell.*.js', status: 200 }]);
  });

  it('запросы идут по адресу, повторы схлопываются', () => {
    const requests = [
      { url: '/b.json', status: 200 },
      { url: '/a.json', status: 404 },
      { url: '/b.json', status: 200 },
    ];
    expect(normalizePassport(rawPassport({ requests })).requests).toEqual([
      { url: '/a.json', status: 404 },
      { url: '/b.json', status: 200 },
    ]);
  });

  it('хэши в адресах внутри текста ошибки заменяются на *', () => {
    const errors = ['TypeError at http://localhost:4321/_astro/shell.3f9a2c1e.js:12:5'];
    expect(normalizePassport(rawPassport({ errors })).errors).toEqual([
      'TypeError at http://localhost:4321/_astro/shell.*.js:12:5',
    ]);
  });
});

describe('normalizePassport: глобалы, хранилище, токены, шрифты', () => {
  it('ключи объектов в значении глобала идут по алфавиту', () => {
    const globals = { __MERFY_CONFIG__: '{"b":{"d":1,"c":2},"a":[{"y":1,"x":2}]}' };
    expect(normalizePassport(rawPassport({ globals })).globals).toEqual({
      __MERFY_CONFIG__: '{"a":[{"x":2,"y":1}],"b":{"c":2,"d":1}}',
    });
  });

  it('хранилище, cookie и шрифты — по алфавиту и без повторов', () => {
    const passport = normalizePassport(
      rawPassport({
        storage: ['session:b', 'local:merfy:cartId', 'session:b'],
        cookies: ['z', 'a', 'z'],
        fonts: ['Manrope 700 normal', 'Manrope 400 normal ', 'Manrope 700 normal'],
      }),
    );
    expect(passport.storage).toEqual(['local:merfy:cartId', 'session:b']);
    expect(passport.cookies).toEqual(['a', 'z']);
    expect(passport.fonts).toEqual(['Manrope 400 normal', 'Manrope 700 normal']);
  });

  it('ключи токенов по алфавиту, значения как есть', () => {
    const tokens = { '--primary': '#111111', '--background': 'rgb(255 255 255)' };
    const normalized = normalizePassport(rawPassport({ tokens })).tokens;
    expect(Object.keys(normalized)).toEqual(['--background', '--primary']);
    expect(normalized['--background']).toBe('rgb(255 255 255)');
  });
});

describe('normalizePassport: схема', () => {
  it('хранилище — только ключи: запись со значением не проходит и называет поле', () => {
    const raw = { ...rawPassport(), storage: [{ key: 'merfy:cartId', value: 'cart-1' }] };
    expect(() => normalizePassport(raw)).toThrow(/storage\.0: /);
  });

  it('ключ хранилища без области local: или session: не проходит', () => {
    expect(() => normalizePassport(rawPassport({ storage: ['merfy:cartId'] }))).toThrow(/storage\.0: /);
  });

  it('паспорт без поля — ошибка passport-invalid с именем поля', () => {
    const raw = Object.fromEntries(Object.entries(rawPassport()).filter(([key]) => key !== 'fonts'));
    expect(() => normalizePassport(raw)).toThrow(StandError);
    expect(() => normalizePassport(raw)).toThrow(/^passport-invalid: паспорт:\nfonts: /);
  });

  it('значение глобала не JSON — ошибка называет глобал', () => {
    const globals = { __MERFY_SITE_ID__: 'demo-site' };
    expect(() => normalizePassport(rawPassport({ globals }))).toThrow(/globals\.__MERFY_SITE_ID__: нужен текст JSON/);
  });

  it('повторная нормализация ничего не меняет', () => {
    const once = normalizePassport(
      rawPassport({
        scripts: [{ src: '/_astro/shell.3f9a2c1e.js?v=3', kind: 'module', bytes: 1 }],
        requests: [{ url: '/_astro/shell.3f9a2c1e.js', status: 200 }],
        globals: { __MERFY_CONFIG__: '{"b":1,"a":2}' },
        storage: ['session:b', 'local:a'],
      }),
    );
    expect(normalizePassport(once)).toEqual(once);
  });
});
