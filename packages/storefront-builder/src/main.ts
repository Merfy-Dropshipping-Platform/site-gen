import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog, platformRenderHash, readShellBuild } from '@merfy/storefront-build';
import { createS3Store } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { raiseAlert } from './alert';
import { enabledExtensions } from './code';
import { createConductor } from './release/conductor';
import { startPlatformRelease } from './release/platform';
import { listenReleases } from './release/listen';
import { checkShopPages } from './release/page-check';
import { bootstrapRelease, releasedVersion } from './release/store';
import { ensureRendererArchive } from './renderer-archive';
import { openBroker } from './broker';
import { startDrawServer } from './draw';
import { createIndexNow } from './indexnow';
import { jsonLog } from './log';
import { previewVia } from './preview';
import { createPreviewRenderers } from './preview-renderers';
import { openRpc } from './rpc';
import { enqueueVia, startRuntime, type RuntimeDeps } from './runtime';
import { storeFontBytes } from './preview-fonts';
import { consumeSectionErrors } from './section-error-store';
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
// Выпуски (блок 10): версия образа — выпущенной, если выпусков темы на контуре ещё не было.
for (const [themeId, theme] of loaded.themes) await bootstrapRelease(db, themeId, theme, settings.contour);
const changelogs = new Map(
  await Promise.all(
    [...loaded.themes.keys()].map(async (themeId) => {
      const file = join(ROOT, 'packages', `theme-${themeId}`, 'changelog.json');
      return [themeId, parseChangelog(JSON.parse(await readFile(file, 'utf8')))] as const;
    }),
  ),
);
// Версии тем магазинов (блок 10): прошлые версии — из архивов, распаковка — во временную папку процесса.
const RENDERER_CACHE_DIR = join(tmpdir(), 'merfy-renderers');
await mkdir(RENDERER_CACHE_DIR, { recursive: true });
const currentVersion = (themeId: string): Promise<string> => Promise.resolve(loaded.themes.get(themeId)?.version ?? '');
const catalog = createThemeCatalog({
  current: loaded.themes,
  previews: loaded.previews,
  index: (themeId) => recordedVersions(store, themeId),
  load: archiveLoader(ROOT, store, RENDERER_CACHE_DIR, log, { standPage: settings.standPage }),
  released: async (themeId) => (await releasedVersion(db, themeId, settings.contour)) ?? currentVersion(themeId),
  log,
});
// Ядро из образа (сборка — задача 3 блока 7): его нет — сборщик не стартует (shell-missing).
const shell = await readShellBuild(ROOT);
const broker = openBroker(settings.rabbitmqUrl, log);
const rpc = openRpc(settings.rabbitmqUrl);
const platform = {
  renderHash: await platformRenderHash(ROOT),
  apiUrl: settings.apiUrl,
  analyticsUrl: settings.analyticsUrl,
};
const products = { call: rpc.call, timeoutMs: settings.productTimeoutMs, log };
// Код магазина (блок 7): реестр секций, места из ревизии, включённые расширения; тайм-аут — как у товаров.
const code = { db, shell, call: rpc.call, timeoutMs: settings.productTimeoutMs, log };
const counters = { call: rpc.call, timeoutMs: settings.analyticsTimeoutMs, log };
const snapshot = { db, products, code, counters, platform, themes: loaded.themes, clock };

// Включённые расширения магазина для выпуска расширения (задача 11) — тот же вызов extensions.enabledForShop и тот же
// тайм-аут, что у снимка. Сервис не ответил — шаг ведущего падает, сверка повторит его через 30 с.
async function extensionsOf(siteId: string): Promise<readonly { id: string; version: string }[]> {
  const found = await enabledExtensions(code, siteId);
  if (found === null) throw new Error(`extensions.enabledForShop не ответил: магазин ${siteId}`);
  return found;
}

// Ведущий волн (блок 10). Окно — K: в работе не больше магазинов волны, чем мест выпуска.
const pageDeps = { fetch: (address: string) => fetch(address), attempts: 5, delayMs: 1_000 };
const conductor = createConductor({
  db,
  store,
  contour: settings.contour,
  window: settings.releaseSlots,
  pauseMs: settings.releasePauseMs,
  clock,
  log,
  publishEvent: broker.publishEvent,
  publishCheck: broker.publishCheck,
  publishActivity: broker.publishActivity,
  pageCheck: (url, expected) => checkShopPages(pageDeps, url, expected),
  // Выпуски платформы и расширения (задача 11): магазины новых тем, тестовый магазин, расширения магазина.
  themeIds: [...loaded.themes.keys()],
  testShop: settings.releaseTestShop,
  enabledExtensions: extensionsOf,
  // Выпуск платформы с другим кодом ведёт сборщик того кода (П10-7 А): выкатка «rolling» — секунды двух образов.
  renderHash: platform.renderHash,
});
// Снимку — версии тем и выпущенная версия (блок 10): магазин рисуется версией своего закрепления.
const pinnedSnapshot = { ...snapshot, pins: catalog };

const deps: RuntimeDeps = {
  db,
  store,
  snapshot: pinnedSnapshot,
  themes: loaded.themes,
  catalog,
  conductor,
  afterBuild: (build) => conductor.afterBuild(build),
  changelogs,
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

const runtime = await startRuntime(deps);
// Ошибки секций из браузеров (блок 11, часть 4): очередь шлюза → таблица storefront_section_error.
await consumeSectionErrors({ broker, db, log });
// Выпуск платформы (задача 11): новый образ — новый код платформы (renderHash, в нём ядро и секции платформы); тот же
// отпечаток — ничего. Заводится до подписки: resume ниже сразу поведёт его волну 0.
const platformRelease = {
  db,
  contour: settings.contour,
  themeIds: deps.themeIds,
  testShop: settings.releaseTestShop,
  log,
};
await startPlatformRelease(platformRelease, { commit: settings.commit, renderHash: platform.renderHash });
// Ведущий просыпается от NOTIFY storefront_release; при старте сверяет выпуски — перезапуск посреди выпуска (блок 10).
const stopListening = await listenReleases(db, () => void conductor.advance(), log);
await conductor.resume();
// Превью — версией закрепления магазина; схема панели — по темам образа (блок 10, задача 4).
const previewOf = (themeId: string, version: string) => catalog.previewAt(themeId, version);
const fonts = storeFontBytes(store);
const previewRenderers = createPreviewRenderers({ limit: settings.previewRenderers });
const preview = {
  db,
  themes: loaded.previews,
  pins: catalog,
  previewOf,
  apiUrl: settings.apiUrl,
  fonts,
  log,
  snapshot: pinnedSnapshot,
  catalog,
  renderers: previewRenderers,
};
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
  // Ведущий волн (блок 10) не обрывается посреди шага: новых шагов не берёт, идущий доделывает — параллельно со
  // сборками и не дольше BUILD_DRAIN_MS. Не успел — шаг повторит resume следующего запуска: записи условные.
  await stopListening();
  const [interrupted] = await Promise.all([runtime.shutdown(settings.drainMs), conductor.shutdown(settings.drainMs)]);
  if (interrupted > 0) {
    log('builder-stopped', { interrupted });
    process.exit(0);
  }
  server.close();
  await broker.close();
  await rpc.close();
  await catalog.close();
  await previewRenderers.close();
  await loaded.close();
  await db.end();
  log('builder-stopped');
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
