import { checkManifest, type ShopPageLocals } from '@merfy/storefront-build';
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
import type { RuntimeDeps } from '../../src/runtime';
import { openRpc, type RpcClient } from '../../src/rpc';
import type { StartedJob } from '../../src/shop-state';
import { STACK, openPool, wait } from './stack';

// Сборщик на стенде: настоящие база, брокер и MinIO, тема — подставная: рисует по данным страницы HTML, который проходит
// SEO-проверку блока 4, — как nova: описания и ключевых слов нет — тегов нет. Задержка рисования — чтобы поймать «правку
// во время сборки»; hangOnce — следующая страница рисуется hangMs (минуту): так сборщик «умирает» посреди сборки.
export const render = { delayMs: 0, hangOnce: false, hangMs: 60_000 };

const metaTag = (name: string, content: string): string =>
  content === '' ? '' : `<meta name="${name}" content="${content}">`;

async function fakeRender(path: string, locals: ShopPageLocals): Promise<string> {
  const delay = render.hangOnce ? render.hangMs : render.delayMs;
  render.hangOnce = false;
  await wait(delay);
  const { head, shop } = locals;
  return [
    `<!doctype html><html lang="${head.lang}"><head><title>${head.title}</title>`,
    `${metaTag('description', head.description)}${metaTag('keywords', head.keywords)}`,
    `<link rel="canonical" href="${head.canonical}">`,
    `</head><body><h1>${shop.name}</h1><p>${path}</p></body></html>`,
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

export interface Harness {
  db: Pool;
  store: ObjectStore;
  broker: Broker;
  rpc: RpcClient;
  lines: string[];
  queued: StartedJob[];
  deps: RuntimeDeps;
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
  const platform = { renderHash: RENDER_HASH, apiUrl: 'https://gateway.dev.merfy.ru/api' };
  const deps: RuntimeDeps = {
    db,
    store,
    snapshot: { db, products: { call: rpc.call, timeoutMs: 1_000, log }, platform, themes, clock },
    themes,
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
  return { db, store, broker, rpc, lines, queued, deps, close };
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
