import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import standInputsJson from '../../fixtures/stand-inputs.json';
import { buildStorefront, type StorefrontBuild } from '../../src/build';
import { readClientFiles } from '../../src/client-files';
import { startRenderer, type Renderer } from '../../src/renderer';
import { textHash } from '../../src/csp';
import { buildRendererBundle } from '../../src/theme-build';
import { novaTokens } from '../support-theme';

// Магазин-стенд целиком на настоящем рисовальщике темы nova (design.md блока 4, «Готово, когда»).
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
// Ссылки страницы на файлы сайта: href="/…" и src="/…".
const SITE_LINK = /(?:href|src)="\/([^"/][^"]*)"/g;

describe('магазин-стенд на рисовальщике nova', () => {
  let renderer: Renderer;
  let build: StorefrontBuild;

  beforeAll(async () => {
    const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
    renderer = await startRenderer(bundle.serverEntry);
    const clientFiles = await readClientFiles(bundle.clientDir);
    build = await buildStorefront(standInputsJson, REFERENCES, {
      tokens: novaTokens,
      render: renderer.render,
      clientFiles,
    });
  });

  afterAll(async () => {
    await renderer.close();
  });

  it('манифест стенда прошёл схему: главная, файлы клиента, ключ', () => {
    expect(build.manifest.pages.map((page) => page.path)).toEqual(['/']);
    expect(Object.keys(build.manifest.files)).toContain('index.html');
    expect(Object.keys(build.manifest.files).some((path) => path.startsWith('_astro/'))).toBe(true);
    expect(build.manifest.key).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('каждый файл, на который ссылается главная, есть среди файлов сборки', () => {
    const home = build.files.find((file) => file.path === 'index.html');
    const html = Buffer.from(home?.content ?? new Uint8Array()).toString('utf8');
    const links = [...html.matchAll(SITE_LINK)].map((match) => match[1]);
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => !(link in build.manifest.files))).toEqual([]);
  });

  // Часть 15е (Р15е-4): каждый исполняемый встроенный скрипт каждого HTML сборки — с хешем в script-src политики
  // манифеста. Разбор свой, не inlineScripts: тест не зависит от проверяемого кода.
  it('CSP: у каждого встроенного скрипта страниц сборки есть хеш в script-src', () => {
    const policy = build.manifest.csp ?? '';
    const script = policy.split('; ').find((part) => part.startsWith('script-src '))?.split(' ') ?? [];
    const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const runs = (attrs: string): boolean =>
      !/\bsrc=/i.test(attrs) && !/type="application\/(?:ld\+)?json"/i.test(attrs);
    const missing = build.files
      .filter((file) => file.path.endsWith('.html'))
      .flatMap((file) =>
        [...Buffer.from(file.content).toString('utf8').matchAll(SCRIPT)]
          .filter((match) => runs(match[1] ?? '') && (match[2] ?? '') !== '')
          .filter((match) => !script.includes(textHash(match[2] ?? '')))
          .map((match) => `${file.path}: ${(match[2] ?? '').trim().slice(0, 60)}`),
      );
    expect(policy).not.toBe('');
    expect(missing).toEqual([]);
  });
});
