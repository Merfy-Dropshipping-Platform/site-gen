import {
  NO_ASSETS,
  type BuildInputs,
  type CodeAssets,
  type CodeSection,
  type ShellBuild,
} from '@merfy/storefront-build';
import { visibleSections, type Queryable, type SectionRow } from '@merfy/storefront-sections';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Код магазина для сборки (design.md блока 7, п. 19 и 24). Секции, видимые магазину, — платформы в версии ядра, его
// темы в её версии, включённых у него расширений в их версиях и свои опубликованные (реестр storefront_section). Места —
// ключ sections текущей ревизии; глобальные скрипты видимых авторов — на всех страницах. Включённые расширения — у
// сервиса extensions по RPC. Он не ответил или места не той формы — кода нет, снимок «не получен», сборки нет: живой
// сайт не трогаем (блок 6, «Нет данных — нет выкладки»).
export const EXTENSIONS_QUEUE = 'extensions_queue';
const ENABLED_FOR_SHOP = 'extensions.enabledForShop';
// Места секций: { "<id страницы>": ["<имя секции>", …] }. Ключа нет или он не объект — мест нет.
const PLACEMENT_SQL = `SELECT CASE WHEN jsonb_typeof(r.data->'sections') = 'object' THEN r.data->'sections'
  ELSE '{}'::jsonb END AS sections FROM site s LEFT JOIN site_revision r ON r.id = s.current_revision_id
  WHERE s.id = $1`;

export interface ShopCode {
  shell: BuildInputs['shell'];
  code: BuildInputs['code'];
  assets: CodeAssets;
  // Включённые у магазина расширения и их версии (блок 10, задача 11): в манифест сборки — по ним выпуск расширения
  // видит, дошёл ли магазин до версии.
  extensions: readonly Extension[];
}

// Кода нет — снимок не получен: во входах пустой код, сборки всё равно не будет (data-not-received блока 4).
export const NO_CODE: ShopCode = {
  shell: null,
  code: { sections: [], pages: {}, globals: [] },
  assets: NO_ASSETS,
  extensions: [],
};

export interface CodeDeps {
  db: Queryable;
  // Сборка ядра из образа (readShellBuild блока 4); её версия — выпуск секций платформы.
  shell: ShellBuild;
  call: Call;
  timeoutMs: number;
  log: Log;
}

export interface Extension {
  id: string;
  version: string;
}

const extensionsAnswer = z.object({
  success: z.boolean(),
  data: z.array(z.object({ id: z.string().min(1), version: z.string().min(1) })).optional(),
});
const placementRow = z.object({ sections: z.unknown() });
const placementSchema = z.record(z.string().regex(/^[a-z0-9-]+$/), z.array(z.string()));
export type Placement = z.infer<typeof placementSchema>;

// Включённые у магазина расширения — id и версия. null — не получены, причина — в журнале.
export async function enabledExtensions(
  request: Pick<CodeDeps, 'call' | 'timeoutMs' | 'log'>,
  shopId: string,
): Promise<Extension[] | null> {
  try {
    const raw = await request.call(EXTENSIONS_QUEUE, ENABLED_FOR_SHOP, { shopId }, request.timeoutMs);
    const answer = extensionsAnswer.parse(raw);
    if (!answer.success) throw new StorefrontBuilderError('rpc-failed', `${ENABLED_FOR_SHOP}: success = false`);
    return (answer.data ?? []).map(({ id, version }) => ({ id, version }));
  } catch (error) {
    request.log('extensions-failed', { shopId, error: errorText(error) });
    return null;
  }
}

// Места секций магазина. null — ключ sections не той формы: его пишет конструктор, причина — в журнале.
async function readPlacement(deps: CodeDeps, shopId: string): Promise<Placement | null> {
  const { rows } = await deps.db.query(PLACEMENT_SQL, [shopId]);
  const value = rows.map((row) => placementRow.parse(row).sections).at(0) ?? {};
  const parsed = placementSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  deps.log('sections-invalid', { shopId, error: parsed.error.issues.map((issue) => issue.message).join('; ') });
  return null;
}

const sectionOf = (row: SectionRow): CodeSection => ({
  name: row.name,
  kind: row.kind,
  hash: row.contentHash,
  html: row.template,
  css: row.style,
  script: row.scriptHash,
});

// Файл скрипта — текст готового модуля из строки реестра: те же байты лежат в storefront/blobs (приём, задача 10).
const moduleOf = (row: SectionRow): [string, Uint8Array][] =>
  row.script === null || row.scriptHash === null ? [] : [[row.scriptHash, Buffer.from(row.script, 'utf8')]];

// Код из видимых строк: секции, которые стоят на страницах (место без видимой секции пропускается: расширение
// выключили, своя секция ещё не опубликована), и все глобальные скрипты. Ядро — только если есть хоть один скрипт.
export function codeOf(
  rows: readonly SectionRow[],
  placement: Placement,
  shell: ShellBuild,
): Omit<ShopCode, 'extensions'> {
  const placeable = new Set(rows.filter((row) => row.kind === 'section').map((row) => row.name));
  const pages = Object.fromEntries(
    Object.entries(placement).map(([page, names]): [string, string[]] => [
      page,
      names.filter((name) => placeable.has(name)),
    ]),
  );
  const placed = new Set(Object.values(pages).flat());
  const used = rows.filter((row) => row.kind === 'global' || placed.has(row.name));
  const globals = used.filter((row) => row.kind === 'global').map((row) => row.name);
  const modules = new Map(used.flatMap(moduleOf));
  const input = { version: shell.version, hash: shell.hash, preload: shell.preload };
  const code = { sections: used.map(sectionOf), pages, globals };
  return { shell: modules.size > 0 ? input : null, code, assets: { shell, modules } };
}

// Код магазина целиком. null — не получен: расширения не ответили или места не той формы.
export async function readShopCode(
  deps: CodeDeps,
  shopId: string,
  theme: { id: string; version: string },
): Promise<ShopCode | null> {
  const [extensions, placement] = await Promise.all([enabledExtensions(deps, shopId), readPlacement(deps, shopId)]);
  if (extensions === null || placement === null) return null;
  const visibility = {
    platformRelease: deps.shell.version,
    theme: { id: theme.id, version: theme.version },
    shopId,
    extensions,
  };
  const shopCode = codeOf(await visibleSections(deps.db, visibility), placement, deps.shell);
  return { ...shopCode, extensions };
}
