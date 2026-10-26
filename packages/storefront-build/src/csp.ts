import { createHash } from 'node:crypto';
import { MOTION_HEAD_SCRIPT } from '@merfy/shell/behaviors/motion-css';
import { counterScripts } from '@merfy/shell/counters';
import type { Counter, CounterKind, CustomCode } from '@merfy/storefront-config';

// Политика CSP магазина новой темы (блок 13 «Секций и SDK», часть 13б; design.md блока 13, 13.5, «Решил сам» 8): поле
// csp манифеста → таблица раздачи → заголовок раздачи у HTML (режим — STOREFRONT_CSP образа storefront-proxy). Хеши —
// только встроенного кода, который пишет платформа: флаг движения (часть 6б), шаблоны счётчиков с номером
// (@merfy/shell/counters) и встроенные скрипты страниц оформления — их тексты даёт сборка (блок 15, часть 15е, Р15е-4);
// HTML страниц магазина не разбирается. Две политики: обычная и для магазина со «своим кодом» —
// 'strict-dynamic': скрипты, которые создаёт ядро, проходят сами, адреса чатов и виджетов мерчанта заранее неизвестны.
const METRIKA_ZONES = [
  'ru',
  'az',
  'by',
  'co.il',
  'com',
  'com.am',
  'com.ge',
  'com.tr',
  'ee',
  'fr',
  'kg',
  'kz',
  'lt',
  'lv',
  'md',
  'tj',
  'tm',
  'uz',
];
const METRIKA_HOSTS = [...METRIKA_ZONES.map((zone) => `mc.yandex.${zone}`), 'mc.webvisor.com', 'mc.webvisor.org'];
const https = (hosts: readonly string[]): string[] => hosts.map((host) => `https://${host}`);

interface CounterSources {
  script: readonly string[];
  connect: readonly string[];
  frame: readonly string[];
}

// Адреса счётчиков — по документации (Метрика: «Использование счётчика на сайте с CSP», общий список адресов; GA4:
// tag-platform/security/guides/csp; VK — шаблон generateInjectHTML сборщика аналитики), дальше — по отчётам CSP.
export const COUNTER_SOURCES: Readonly<Record<CounterKind, CounterSources>> = {
  metrika: {
    script: https([...METRIKA_HOSTS, 'yastatic.net']),
    connect: [...https([...METRIKA_HOSTS, 'yastatic.net']), ...METRIKA_HOSTS.map((host) => `wss://${host}`)],
    frame: https(METRIKA_HOSTS),
  },
  vk: { script: https(['vk.com', '*.vk.com']), connect: https(['vk.com', '*.vk.com']), frame: https(['vk.com']) },
  google: {
    script: https(['*.googletagmanager.com']),
    connect: https(['*.google-analytics.com', '*.analytics.google.com', '*.googletagmanager.com']),
    frame: [],
  },
};

// Длиннее — политики нет совсем (магазин без CSP, как сейчас), а не обрезанная. Тот же предел проверяют манифест,
// таблица раздачи и nginx.
export const CSP_MAX_LENGTH = 12_288;
const BUNDLE_FILE = /^_merfy\/b\/[0-9a-f]{64}\.js$/;
const HEX_HASH = /^sha256:([0-9a-f]{64})$/;

export interface CspSource {
  // Файлы сборки: путь → sha256:<hex> (manifest.files).
  files: Readonly<Record<string, string>>;
  apiUrl: string;
  analyticsUrl: string;
  counters: readonly Counter[];
  custom: readonly CustomCode[];
  // Тексты встроенных скриптов страниц оформления (часть 15е, Р15е-4) — хешами в script-src обеих политик.
  inline: readonly string[];
  // Хранилище файлов покупательницы (часть 15е, Р15е-5): STOREFRONT_UPLOAD_URL сборщика; нет — в connect-src его нет.
  uploadUrl?: string;
}

const quoted = (base64: string): string => `'sha256-${base64}'`;
export const textHash = (text: string): string => quoted(createHash('sha256').update(text, 'utf8').digest('base64'));

function fileHash(hash: string): string | null {
  const hex = HEX_HASH.exec(hash)?.[1];
  return hex === undefined ? null : quoted(Buffer.from(hex, 'hex').toString('base64'));
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

// Хеши встроенных скриптов страниц оформления (часть 15е, Р15е-4).
const pageHashes = (source: CspSource): string[] => source.inline.map(textHash);

// Свои источники запросов: шлюз, сборщик аналитики и хранилище файлов покупательницы, если оно есть (часть 15е).
const ownOrigins = (source: CspSource): string[] =>
  unique(
    [new URL(source.apiUrl).origin, new URL(source.analyticsUrl).origin, source.uploadUrl].flatMap((origin) =>
      origin === undefined ? [] : [new URL(origin).origin],
    ),
  );

interface CounterParts {
  hashes: string[];
  script: string[];
  connect: string[];
  frame: string[];
}

function counterParts(counters: readonly Counter[]): CounterParts {
  const inline = counters.flatMap(counterScripts).filter((script) => script.src === null);
  const sources = counters.map((counter) => COUNTER_SOURCES[counter.kind]);
  return {
    hashes: unique(inline.map((script) => textHash(script.code))),
    script: unique(sources.flatMap((source) => source.script)),
    connect: unique(sources.flatMap((source) => source.connect)),
    frame: unique(sources.flatMap((source) => source.frame)),
  };
}

const directives = (rows: readonly (readonly string[])[]): string => rows.map((row) => row.join(' ')).join('; ');

function normalPolicy(source: CspSource, counters: CounterParts): string {
  const hashes = unique([textHash(MOTION_HEAD_SCRIPT), ...counters.hashes, ...pageHashes(source)]);
  return directives([
    ['default-src', "'self'"],
    ['script-src', "'self'", ...hashes, ...counters.script],
    ['connect-src', "'self'", ...ownOrigins(source), ...counters.connect],
    ['img-src', "'self'", 'data:', 'https:'],
    ['media-src', "'self'", 'https:'],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['font-src', "'self'"],
    ['frame-src', "'self'", ...counters.frame],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['report-uri', `${source.analyticsUrl}/csp`],
  ]);
}

// 'unsafe-inline' и https: в script-src — только для браузеров без CSP3: с 'strict-dynamic' и хешами их не читают.
function strictPolicy(source: CspSource, counters: CounterParts): string {
  const bundles = unique(
    Object.entries(source.files)
      .filter(([path]) => BUNDLE_FILE.test(path))
      .flatMap(([, hash]) => fileHash(hash) ?? []),
  ).sort();
  const script = [
    "'strict-dynamic'",
    ...unique([textHash(MOTION_HEAD_SCRIPT), ...bundles, ...counters.hashes, ...pageHashes(source)]),
  ];
  return directives([
    ['script-src', ...script, "'unsafe-inline'", 'https:'],
    ['connect-src', "'self'", 'https:', 'wss:'],
    ['img-src', "'self'", 'data:', 'https:'],
    ['media-src', "'self'", 'https:'],
    ['style-src', "'self'", "'unsafe-inline'", 'https:'],
    ['font-src', "'self'", 'data:', 'https:'],
    ['frame-src', 'https:'],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['report-uri', `${source.analyticsUrl}/csp`],
  ]);
}

export function storefrontCsp(source: CspSource): string | null {
  const counters = counterParts(source.counters);
  const policy = source.custom.length > 0 ? strictPolicy(source, counters) : normalPolicy(source, counters);
  return policy.length > CSP_MAX_LENGTH ? null : policy;
}
