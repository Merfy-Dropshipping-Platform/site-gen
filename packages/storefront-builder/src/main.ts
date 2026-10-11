import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformRenderHash, readShellBuild } from '@merfy/storefront-build';
import { createS3Store } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { raiseAlert } from './alert';
import { ensureRendererArchive } from './renderer-archive';
import { openBroker } from './broker';
import { startDrawServer } from './draw';
import { createIndexNow } from './indexnow';
import { jsonLog } from './log';
import { previewVia } from './preview';
import { openRpc } from './rpc';
import { enqueueVia, startRuntime, type RuntimeDeps } from './runtime';
import { acceptSectionReleases, releaseFolders } from './section-releases';
import { RETRY_DELAYS_MS, readSettings } from './settings';
import { createSlots } from './slots';
import { archiveLoader, createThemeCatalog, recordedVersions } from './theme-catalog';
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
const loaded = await loadThemes(ROOT, { standPage: settings.standPage });
// Архив рисовальщика своей версии каждой темы — в хранилище (блок 10): на нём стоят магазины, до которых дойдёт выпуск.
for (const [themeId, theme] of loaded.themes) {
  const state = { version: theme.version, contentHash: theme.contentHash };
  log('renderer-archive-ready', {
    themeId,
    version: theme.version,
    outcome: await ensureRendererArchive({ store, log, clock }, ROOT, themeId, state),
  });
}
// Версии тем магазинов (блок 10): прошлые версии — из архивов, распаковка — во временную папку процесса.
const RENDERER_CACHE_DIR = join(tmpdir(), 'merfy-renderers');
await mkdir(RENDERER_CACHE_DIR, { recursive: true });
const currentVersion = (themeId: string): Promise<string> => Promise.resolve(loaded.themes.get(themeId)?.version ?? '');
const catalog = createThemeCatalog({
  current: loaded.themes,
  previews: loaded.previews,
  index: (themeId) => recordedVersions(store, themeId),
  load: archiveLoader(ROOT, store, RENDERER_CACHE_DIR, log, { standPage: settings.standPage }),
  released: currentVersion,
  log,
});
// Ядро из образа (сборка — задача 3 блока 7): его нет — сборщик не стартует (shell-missing).
const shell = await readShellBuild(ROOT);
const broker = openBroker(settings.rabbitmqUrl, log);
const rpc = openRpc(settings.rabbitmqUrl);
const platform = { renderHash: await platformRenderHash(ROOT), apiUrl: settings.apiUrl };
const products = { call: rpc.call, timeoutMs: settings.productTimeoutMs, log };
// Код магазина (блок 7): реестр секций, места из ревизии, включённые расширения; тайм-аут — как у товаров.
const code = { db, shell, call: rpc.call, timeoutMs: settings.productTimeoutMs, log };
const snapshot = { db, products, code, platform, themes: loaded.themes, clock };

// Снимку — версии тем и выпущенная версия (блок 10): магазин рисуется версией своего закрепления.
const pinnedSnapshot = { ...snapshot, pins: catalog };

const deps: RuntimeDeps = {
  db,
  store,
  snapshot: pinnedSnapshot,
  themes: loaded.themes,
  catalog,
  platformCommit: settings.commit,
  indexable: settings.indexable,
  shopState: { leaseMs: settings.leaseMs, retryDelaysMs: RETRY_DELAYS_MS },
  releaseSlots: settings.releaseSlots,
  clock,
  log,
  enqueue: enqueueVia(broker, log),
  alert: (stopped) => raiseAlert({ db, publishActivity: broker.publishActivity, log, clock }, stopped),
  announce: settings.indexNow === null ? undefined : createIndexNow({ ...settings.indexNow, log }),
  preview: previewVia(broker.publishPreview, log),
  broker,
  themeIds: [...loaded.themes.keys()],
  slots: settings.buildSlots,
  reconcileMs: settings.reconcileMs,
};

// Секции платформы и тем — в реестр до первой сборки (дверь выпуска, п. 21); отказ — строка журнала, старт идёт дальше.
await acceptSectionReleases({ db, store, log }, releaseFolders(ROOT, shell.version, loaded.themes));
const runtime = await startRuntime(deps);
// Превью — версией закрепления магазина; схема панели — по темам образа (блок 10, задача 4).
const previewOf = (themeId: string, version: string) => catalog.previewAt(themeId, version);
const preview = { db, themes: loaded.previews, pins: catalog, previewOf, apiUrl: settings.apiUrl, log };
const drawDeps = {
  store,
  snapshot: pinnedSnapshot,
  catalog,
  themes: loaded.themes,
  renderHash: platform.renderHash,
  log,
  preview,
};
const slots = createSlots(settings.drawSlots);
const server = await startDrawServer({ ...drawDeps, slots, timeoutMs: settings.drawTimeoutMs }, settings.port);
const started = { port: settings.port, slots: settings.buildSlots, releaseSlots: settings.releaseSlots };
log('builder-started', { ...started, themes: deps.themeIds.join(','), renderHash: platform.renderHash });

// Остановка по сигналу Coolify (`docker stop -t 30`): новые события и задания не берём, идущие сборки ждём не дольше
// BUILD_DRAIN_MS. Не дождались — сборка «прервана», замок снят (runtime.ts, shutdown), и процесс выходит сразу: брошенная
// сборка не должна идти рядом с той, что возьмёт задание в другом сборщике. Брокер вернёт её сообщение в очередь, а
// взять его по старому номеру уже нельзя (claimJob).
async function shutdown(): Promise<void> {
  const interrupted = await runtime.shutdown(settings.drainMs);
  if (interrupted > 0) {
    log('builder-stopped', { interrupted });
    process.exit(0);
  }
  server.close();
  await broker.close();
  await rpc.close();
  await catalog.close();
  await loaded.close();
  await db.end();
  log('builder-stopped');
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
