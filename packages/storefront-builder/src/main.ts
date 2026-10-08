import { fileURLToPath } from 'node:url';
import { platformRenderHash } from '@merfy/storefront-build';
import { createS3Store } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { raiseAlert } from './alert';
import { openBroker } from './broker';
import { startDrawServer } from './draw';
import { jsonLog } from './log';
import { openRpc } from './rpc';
import { enqueueVia, startRuntime, type RuntimeDeps } from './runtime';
import { RETRY_DELAYS_MS, readSettings } from './settings';
import { createSlots } from './slots';
import { loadThemes } from './themes';

// Точка входа сборщика (design.md блока 6, В6-1 А): вторая программа из образа site-gen, без миграций и API sites.
// Запуск — `pnpm --filter @merfy/storefront-builder start` из корня site-gen (в образе — цель Dockerfile
// storefront-builder). Слушает события и задания RabbitMQ, на PORT — /draw для раздачи и /health для Coolify.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const clock = (): Date => new Date();
const log = jsonLog((line) => process.stdout.write(line), clock);

const settings = readSettings(process.env);
const db = new Pool({ connectionString: settings.databaseUrl });
const store = createS3Store(settings.s3);
const loaded = await loadThemes(ROOT);
const broker = openBroker(settings.rabbitmqUrl, log);
const rpc = openRpc(settings.rabbitmqUrl);
const platform = { renderHash: await platformRenderHash(ROOT), apiUrl: settings.apiUrl };
const products = { call: rpc.call, timeoutMs: settings.productTimeoutMs, log };
const snapshot = { db, products, platform, themes: loaded.themes, clock };

const deps: RuntimeDeps = {
  db,
  store,
  snapshot,
  themes: loaded.themes,
  platformCommit: settings.commit,
  indexable: settings.indexable,
  shopState: { leaseMs: settings.leaseMs, retryDelaysMs: RETRY_DELAYS_MS },
  clock,
  log,
  enqueue: enqueueVia(broker, log),
  alert: (stopped) => raiseAlert({ db, publishActivity: broker.publishActivity, log, clock }, stopped),
  broker,
  themeIds: [...loaded.themes.keys()],
  slots: settings.buildSlots,
  reconcileMs: settings.reconcileMs,
};

const runtime = await startRuntime(deps);
const drawDeps = { store, snapshot, themes: loaded.themes, renderHash: platform.renderHash, log };
const slots = createSlots(settings.drawSlots);
const server = await startDrawServer({ ...drawDeps, slots, timeoutMs: settings.drawTimeoutMs }, settings.port);
log('builder-started', { port: settings.port, themes: deps.themeIds.join(','), renderHash: platform.renderHash });

// Остановка по сигналу Coolify: новые задания не берём, недоделанные вернёт брокер — их возьмёт следующий запуск.
async function shutdown(): Promise<void> {
  runtime.stop();
  server.close();
  await broker.close();
  await rpc.close();
  await loaded.close();
  await db.end();
  log('builder-stopped');
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
