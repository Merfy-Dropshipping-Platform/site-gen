import { z } from 'zod';
import { EXTENSION_VERSIONS_QUEUE, type Broker } from '../broker';
import { errorText } from '../errors';
import type { Log } from '../log';
import { parseWith } from '../parse';
import type { Database } from '../shop-state';
import { createOrQueue } from './platform';
import type { ReleaseRow } from './store';

// Новая версия расширения сама становится выпуском (design.md блока 10, П10-5 А и С7-14 Б: «без “да”, волнами»). Сервис
// extensions после того, как записал версию в реестр, кладёт в очередь storefront_extension_versions сообщение Nest
// (emit): { pattern: 'storefront.extension-version', data: { v: 1, extensionId, version, registeredAt } }. Раньше
// выпуск расширения заводила только ручная команда `theme-release extension`; версию, выложенную фаундером через
// MCP, никто не выпускал — магазины сами её не подхватывали (сверка часа версию расширения расхождением не считает).
// Здесь — разбор сообщения и завод выпуска planning: магазины и волны соберёт ведущий (extension.ts).
export const EXTENSION_VERSION_PATTERN = 'storefront.extension-version';
const EXTENSION_VERSIONS_PREFETCH = 5;
const EXTENSION_ID = /^[a-z][a-z0-9-]{2,31}$/;
const VERSION = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const FIRST_VERSION = '0.0.0';

const messageSchema = z.object({
  pattern: z.literal(EXTENSION_VERSION_PATTERN),
  data: z.object({
    v: z.literal(1),
    extensionId: z.string().regex(EXTENSION_ID),
    version: z.string().regex(VERSION),
    registeredAt: z.iso.datetime().optional(),
  }),
});

export interface ExtensionVersion {
  extensionId: string;
  version: string;
}

export interface ExtensionVersionDeps {
  db: Database;
  contour: string;
  log: Log;
}

// Сообщение не той формы — message-invalid: брокер пишет строку журнала и подтверждает его (повтор не починит).
export function parseExtensionVersion(body: unknown): ExtensionVersion {
  const { data } = parseWith(messageSchema, body, 'message-invalid', EXTENSION_VERSIONS_QUEUE);
  return { extensionId: data.extensionId, version: data.version };
}

const LAST_FINISHED_SQL = `SELECT to_version FROM storefront_release WHERE kind = 'extension' AND subject = $1
  AND contour = $2 AND status = 'finished' ORDER BY id DESC LIMIT 1`;
// Версия уже выпускалась или выпускается (в любом состоянии): событие дважды, перезапуск сверки extensions. Остановленный
// и возвращённый выпуск автоматически не повторяется — версия не пойдёт по кругу; повтор — командой `theme-release`.
const SAME_VERSION_SQL = `SELECT 1 FROM storefront_release WHERE kind = 'extension' AND subject = $1
  AND to_version = $2 AND contour = $3 LIMIT 1`;
const versionRow = z.object({ to_version: z.string() });

async function lastFinished(db: Database, extensionId: string, contour: string): Promise<string> {
  const { rows } = await db.query(LAST_FINISHED_SQL, [extensionId, contour]);
  return rows.map((row) => versionRow.parse(row).to_version).at(0) ?? FIRST_VERSION;
}

// Выпуск по версии: planning, магазины — у ведущего (planExtensionRelease). На контуре уже идёт другой выпуск — этот
// ждёт в очереди (queued), ведущий переведёт его в planning. Версия уже выпускалась — null.
export async function startExtensionRelease(
  deps: ExtensionVersionDeps,
  found: ExtensionVersion,
): Promise<ReleaseRow | null> {
  const { db, contour } = deps;
  if ((await db.query(SAME_VERSION_SQL, [found.extensionId, found.version, contour])).rows.length > 0) return null;
  const from = await lastFinished(db, found.extensionId, contour);
  const release = await createOrQueue(
    db,
    {
      kind: 'extension',
      subject: found.extensionId,
      fromVersion: from,
      toVersion: found.version,
      toHash: found.version,
      contour,
      startedBy: 'builder',
      status: 'planning',
    },
    () => [],
  );
  deps.log('release-extension', {
    release: release.id,
    extension: found.extensionId,
    from,
    to: found.version,
    status: release.status,
  });
  return release;
}

// Потребитель очереди extensions. База недоступна — сообщение вернётся в очередь (broker.ts, deliver).
export async function consumeExtensionVersions(deps: ExtensionVersionDeps & { broker: Pick<Broker, 'consume'> }) {
  await deps.broker.consume(EXTENSION_VERSIONS_QUEUE, EXTENSION_VERSIONS_PREFETCH, async ({ body }) => {
    const found = parseExtensionVersion(body);
    try {
      await startExtensionRelease(deps, found);
    } catch (error) {
      deps.log('release-extension-failed', {
        extension: found.extensionId,
        to: found.version,
        error: errorText(error),
      });
      throw error;
    }
  });
}
