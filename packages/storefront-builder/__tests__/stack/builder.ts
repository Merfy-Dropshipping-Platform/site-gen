import {
  checkManifest,
  hashOf,
  sha256,
  type ShellBuild,
  type ShopPageHead,
  type ShopPageLocals,
} from '@merfy/storefront-build';
import {
  blobKey,
  createS3Store,
  manifestKey,
  readObject,
  readPointer,
  type ObjectStore,
} from '@merfy/storefront-storage';
import { parseTheme } from '@merfy/tokens';
import type { Pool } from 'pg';
import { z } from 'zod';
import novaTheme from '../../../theme-nova/theme.json';
import { raiseAlert } from '../../src/alert';
import { openBroker, type Broker } from '../../src/broker';
import type { LoadedTheme } from '../../src/build-job';
import type { CodeDeps } from '../../src/code';
import type { Log } from '../../src/log';
import type { RuntimeDeps } from '../../src/runtime';
import { openRpc, type Call, type RpcClient } from '../../src/rpc';
import type { StartedJob } from '../../src/shop-state';
import { createThemeCatalog, type ThemeCatalog } from '../../src/theme-catalog';
import { STACK, openPool, wait } from './stack';

// Сборщик на стенде: настоящие база, брокер и MinIO, тема — подставная: рисует по данным страницы HTML, который проходит
// SEO-проверку блока 4, — как nova: описания и ключевых слов нет — тегов нет. Задержка рисования — чтобы поймать «правку
// во время сборки»; hangOnce — следующая страница рисуется hangMs (минуту): так сборщик «умирает» посреди сборки.
export const render = { delayMs: 0, hangOnce: false, hangMs: 60_000 };

const metaTag = (name: string, content: string): string =>
  content === '' ? '' : `<meta name="${name}" content="${content}">`;
const ogTag = (property: string, content: string): string =>
  content === '' ? '' : `<meta property="${property}" content="${content}">`;

// Теги для соцсетей — как у nova (блок 9): описания и картинки нет — тегов нет.
const socialTags = ({ title, description, canonical, social }: ShopPageHead): string =>
  [
    ogTag('og:type', social.type),
    ogTag('og:title', title),
    ogTag('og:description', description),
    ogTag('og:url', canonical),
    ogTag('og:site_name', social.siteName),
    ogTag('og:locale', social.locale),
    ogTag('og:image', social.image),
    metaTag('twitter:card', social.card),
  ].join('');

async function fakeRender(path: string, locals: ShopPageLocals): Promise<string> {
  const delay = render.hangOnce ? render.hangMs : render.delayMs;
  render.hangOnce = false;
  await wait(delay);
  const { head, shop } = locals;
  return [
    `<!doctype html><html lang="${head.lang}"><head><title>${head.title}</title>`,
    `${metaTag('description', head.description)}${metaTag('keywords', head.keywords)}`,
    `<link rel="canonical" href="${head.canonical}">${socialTags(head)}${head.codeHtml}`,
    `</head><body><h1>${shop.name}</h1>${locals.sections.join('')}<p>${path}</p></body></html>`,
  ].join('');
}

export const FAKE_THEME: LoadedTheme = {
  version: '0.0.1',
  contentHash: `sha256:${'a'.repeat(64)}`,
  build: {
    tokens: parseTheme(novaTheme.tokens),
    render: fakeRender,
    clientFiles: [{ path: '_astro/shop.css', content: new TextEncoder().encode('body{margin:0}') }],
  },
};

export const RENDER_HASH = `sha256:${'b'.repeat(64)}`;
export const COMMIT = 'c'.repeat(40);

// Ядро сборок стенда (блок 7): один файл; его версия — выпуск секций платформы.
const SHELL_FILES = [{ path: 'shell.js', content: new TextEncoder().encode('export const defineSection = (d) => d;') }];
export const TEST_SHELL: ShellBuild = {
  version: '0.1.0',
  hash: hashOf(Object.fromEntries(SHELL_FILES.map((file): [string, string] => [file.path, sha256(file.content)]))),
  preload: ['shell.js'],
  files: SHELL_FILES,
};

// Ответ подставного сервиса extensions на extensions.enabledForShop — задаёт тест; Error — сервис не ответил.
export const extensions: { answer: unknown } = { answer: { success: true, data: [] } };
const fakeExtensions: Call = () =>
  extensions.answer instanceof Error ? Promise.reject(extensions.answer) : Promise.resolve(extensions.answer);

// Код магазина для снимка на стенде: реестр секций — настоящий, ядро и сервис extensions — подставные.
export const codeDeps = (db: Pool, log: Log): CodeDeps => ({
  db,
  shell: TEST_SHELL,
  call: fakeExtensions,
  timeoutMs: 1_000,
  log,
});

// Пути файлов живой сборки магазина.
export async function liveFiles(store: ObjectStore, label: string): Promise<string[]> {
  const pointer = await readPointer(store, label);
  if (pointer === null) return [];
  const manifest = await readObject(store, manifestKey(pointer.shop, pointer.build), (value) => checkManifest(value));
  return Object.keys(manifest?.value.files ?? {});
}

export interface Harness {
  db: Pool;
  store: ObjectStore;
  broker: Broker;
  rpc: RpcClient;
  lines: string[];
  queued: StartedJob[];
  deps: RuntimeDeps;
  // Каталог версий тем стенда (блок 10): прошлых версий нет, выпущенная — FAKE_THEME. Его берут тесты дорисовки и превью.
  catalog: ThemeCatalog;
  close: () => Promise<void>;
}

export function openHarness(overrides: Partial<RuntimeDeps> = {}): Harness {
  const db = openPool();
  const store = createS3Store(STACK.s3);
  const lines: string[] = [];
  const queued: StartedJob[] = [];
  const clock = () => new Date();
  const log = (message: string, fields = {}) => lines.push(JSON.stringify({ msg: message, ...fields }));
  const broker = openBroker(STACK.rabbitmqUrl, log);
  const rpc = openRpc(STACK.rabbitmqUrl);
  const themes = new Map([['nova', FAKE_THEME]]);
  const catalog = createThemeCatalog({
    current: themes,
    previews: new Map(),
    index: () => Promise.resolve({}),
    load: () => Promise.reject(new Error('прошлых версий на этом стенде нет')),
    released: () => Promise.resolve(FAKE_THEME.version),
    log,
  });
  const platform = {
    renderHash: RENDER_HASH,
    apiUrl: 'https://gateway.dev.merfy.ru/api',
    analyticsUrl: 'https://analytics.dev.merfy.ru',
  };
  const deps: RuntimeDeps = {
    db,
    store,
    snapshot: {
      db,
      products: { call: rpc.call, timeoutMs: 1_000, log },
      code: codeDeps(db, log),
      counters: { call: rpc.call, timeoutMs: 1_000, log },
      platform,
      themes,
      pins: catalog,
      clock,
    },
    themes,
    catalog,
    platformCommit: COMMIT,
    indexable: false,
    shopState: { leaseMs: 60_000, retryDelaysMs: [100, 200] },
    releaseSlots: 1,
    clock,
    log,
    enqueue: (job) => Promise.resolve(void queued.push(job)),
    alert: (stopped) => raiseAlert({ db, publishActivity: broker.publishActivity, log, clock }, stopped),
    broker,
    themeIds: ['nova'],
    slots: 1,
    reconcileMs: 3_600_000,
    ...overrides,
  };
  const close = async () => {
    await broker.close();
    await rpc.close();
    await db.end();
  };
  return { db, store, broker, rpc, lines, queued, deps, catalog, close };
}

// HTML главной живой сборки магазина: указатель → манифест → файл по отпечатку.
export async function liveHome(store: ObjectStore, label: string): Promise<string> {
  const pointer = await readPointer(store, label);
  if (pointer === null) return '';
  const manifest = await readObject(store, manifestKey(pointer.shop, pointer.build), (value) => checkManifest(value));
  const hash = manifest?.value.files['index.html'] ?? '';
  const file = await store.read(blobKey(hash));
  return new TextDecoder().decode(file?.body);
}

const lineSchema = z.record(z.string(), z.unknown());

// Строки журнала с этим msg.
export const logged = (lines: readonly string[], message: string): Record<string, unknown>[] =>
  lines.map((line) => lineSchema.parse(JSON.parse(line))).filter((line) => line.msg === message);
