import { createHash } from 'node:crypto';
import { MOTION_HEAD_SCRIPT } from '@merfy/shell/behaviors/motion-css';
import { counterScripts } from '@merfy/shell/counters';
import type { Counter } from '@merfy/storefront-config';
import { describe, expect, it } from 'vitest';
import { CSP_MAX_LENGTH, storefrontCsp, textHash, type CspSource } from '../src/csp';

const base64 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('base64');
const hexBase64 = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');
const MOTION = `'sha256-${base64(MOTION_HEAD_SCRIPT)}'`;
const BUNDLE_HEX = 'ab'.repeat(32);
const CSS_HEX = '2'.repeat(64);
const SOURCE: CspSource = {
  files: {
    'index.html': `sha256:${'1'.repeat(64)}`,
    '_astro/index.css': `sha256:${CSS_HEX}`,
    [`_merfy/b/${BUNDLE_HEX}.js`]: `sha256:${BUNDLE_HEX}`,
  },
  apiUrl: 'https://gateway.dev.merfy.ru/api',
  analyticsUrl: 'https://analytics.dev.merfy.ru',
  counters: [],
  custom: [],
  inline: [],
};
const METRIKA: Counter = { kind: 'metrika', number: '12345678' };
const GOOGLE: Counter = { kind: 'google', number: 'G-ABCDEF12' };
const CUSTOM = [{ code: '<script>chat()</script>', consent: 'none' as const }];
const inlineHashes = (counter: Counter): string[] =>
  counterScripts(counter).flatMap((script) => (script.src === null ? [textHash(script.code)] : []));
const directive = (policy: string | null, name: string): string[] =>
  (policy ?? '')
    .split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

// Блок 15, часть 15е (Р15е-4, Р15е-5): встроенный код страниц оформления и хранилище файлов покупательницы.
describe('storefrontCsp: встроенный код оформления и хранилище файлов (часть 15е)', () => {
  it('встроенные скрипты — хешами в обеих политиках, по порядку и без повторов', () => {
    const inline = ['window.__merfyRoot = 1;', 'checkout()', 'window.__merfyRoot = 1;'];
    const hashes = [textHash('window.__merfyRoot = 1;'), textHash('checkout()')];
    const normal = directive(storefrontCsp({ ...SOURCE, inline }), 'script-src');
    const strict = directive(storefrontCsp({ ...SOURCE, inline, custom: CUSTOM }), 'script-src');
    expect(normal.filter((source) => hashes.includes(source))).toEqual(hashes);
    expect(strict.filter((source) => hashes.includes(source))).toEqual(hashes);
  });

  it('адрес хранилища файлов покупательницы — в connect-src обычной политики, только origin', () => {
    const policy = storefrontCsp({ ...SOURCE, uploadUrl: 'https://minio.dev.merfy.ru/ext-files' });
    expect(directive(policy, 'connect-src')).toEqual([
      "'self'",
      'https://gateway.dev.merfy.ru',
      'https://analytics.dev.merfy.ru',
      'https://minio.dev.merfy.ru',
    ]);
  });
});

describe('storefrontCsp (блок 13 «Секций и SDK», часть 13б)', () => {
  it('обычная политика: флаг движения по хешу, файлы — свои, запросы — шлюз и сборщик аналитики, отчёты — /csp', () => {
    expect(storefrontCsp(SOURCE)).toBe(
      `default-src 'self'; script-src 'self' ${MOTION}; ` +
        "connect-src 'self' https://gateway.dev.merfy.ru https://analytics.dev.merfy.ru; " +
        "img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
        "frame-src 'self'; object-src 'none'; base-uri 'none'; report-uri https://analytics.dev.merfy.ru/csp",
    );
  });

  it('Метрика: хеш встроенного кода с номером — один на одинаковые счётчики; хосты — из документации', () => {
    const policy = storefrontCsp({ ...SOURCE, counters: [METRIKA, METRIKA] });
    const script = directive(policy, 'script-src');
    expect(script.filter((source) => inlineHashes(METRIKA).includes(source))).toHaveLength(1);
    expect(script).toEqual(
      expect.arrayContaining(['https://mc.yandex.ru', 'https://mc.yandex.com.tr', 'https://yastatic.net']),
    );
    expect(directive(policy, 'connect-src')).toEqual(
      expect.arrayContaining(['wss://mc.yandex.ru', 'https://mc.webvisor.org']),
    );
    expect(script).not.toContain(inlineHashes({ kind: 'metrika', number: '11223344' })[0]);
  });

  it('Google: хеш встроенного кода, gtag — файлом с googletagmanager', () => {
    const policy = storefrontCsp({ ...SOURCE, counters: [GOOGLE] });
    expect(directive(policy, 'script-src')).toEqual(
      expect.arrayContaining([...inlineHashes(GOOGLE), 'https://*.googletagmanager.com']),
    );
    expect(directive(policy, 'connect-src')).toEqual(
      expect.arrayContaining(['https://*.google-analytics.com', 'https://*.analytics.google.com']),
    );
  });

  it('магазин со «своим кодом»: strict-dynamic, флаг движения, бандл по хешу файла, счётчик; запросы — https: и wss:', () => {
    const policy = storefrontCsp({ ...SOURCE, counters: [METRIKA], custom: CUSTOM });
    expect(directive(policy, 'script-src')).toEqual([
      "'strict-dynamic'",
      MOTION,
      `'sha256-${hexBase64(BUNDLE_HEX)}'`,
      ...inlineHashes(METRIKA),
      "'unsafe-inline'",
      'https:',
    ]);
    expect(directive(policy, 'connect-src')).toEqual(["'self'", 'https:', 'wss:']);
    expect(directive(policy, 'frame-src')).toEqual(['https:']);
    expect(policy).not.toContain(hexBase64(CSS_HEX));
    expect(policy?.endsWith('report-uri https://analytics.dev.merfy.ru/csp')).toBe(true);
  });

  it('длиннее CSP_MAX_LENGTH — политики нет; политика — печатные знаки ASCII', () => {
    const files = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => {
        const hex = index.toString(16).padStart(64, '0');
        return [`_merfy/b/${hex}.js`, `sha256:${hex}`];
      }),
    );
    expect(CSP_MAX_LENGTH).toBe(12_288);
    expect(storefrontCsp({ ...SOURCE, files, custom: CUSTOM })).toBeNull();
    expect(storefrontCsp({ ...SOURCE, counters: [METRIKA, GOOGLE] })).toMatch(/^[\x20-\x7e]+$/);
  });
});
