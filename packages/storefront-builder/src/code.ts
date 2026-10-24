import {
  NO_ASSETS,
  type BuildInputs,
  type CodeAssets,
  type CodeInstance,
  type CodeSection,
  type ShellBuild,
} from '@merfy/storefront-build';
import {
  currentSection,
  resolveSectionBlocks,
  resolveSectionSettings,
  revisionMenusSchema,
  sectionGroupsOf,
  sectionMenus,
  visibleSections,
  type CurrentSection,
  type Queryable,
  type RevisionMenu,
  type SectionGroup,
  type SectionRow,
  isDefaultWrapperView,
  resolveWrapperView,
  settingFieldsOf,
} from '@merfy/storefront-sections';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Код магазина для сборки (design.md блока 7, п. 19 и 24). Секции, видимые магазину, — включённых у него расширений в
// их версиях и свои опубликованные (реестр storefront_section); секций платформы и тем нет. Места —
// ключ sections текущей ревизии; глобальные скрипты видимых авторов — на всех страницах. Включённые расширения — у
// сервиса extensions по RPC. Он не ответил или места не той формы — кода нет, снимок «не получен», сборки нет: живой
// сайт не трогаем (блок 6, «Нет данных — нет выкладки»).
export const EXTENSIONS_QUEUE = 'extensions_queue';
const ENABLED_FOR_SHOP = 'extensions.enabledForShop';
// Места секций — ключ sections ревизии (В1-1 А): { "<id страницы>": [{ id, section, settings }, …] }; settings — только
// изменённое мерчантом. Ключа нет или он не объект — мест нет.
// Меню (часть 4, Р1-4-3) — ключ menus той же ревизии: список меню; не список — меню нет.
const PLACEMENT_SQL = `SELECT CASE WHEN jsonb_typeof(r.data->'sections') = 'object' THEN r.data->'sections'
  ELSE '{}'::jsonb END AS sections,
  CASE WHEN jsonb_typeof(r.data->'menus') = 'array' THEN r.data->'menus' ELSE '[]'::jsonb END AS menus
  FROM site s LEFT JOIN site_revision r ON r.id = s.current_revision_id WHERE s.id = $1`;

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
  // Сборка ядра из образа (readShellBuild блока 4).
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
const placementRow = z.object({ sections: z.unknown(), menus: z.unknown().optional() });
// Экземпляр секции в ревизии: id — kebab до 40 знаков, один раз на странице; settings — правки мерчанта; hidden —
// скрыта (п. 22); name — имя мерчанта в конструкторе (п. 24), в код магазина не идёт (Р17).
// Блок экземпляра (часть 3, Р54): id — kebab до 40 знаков, один раз в экземпляре (повтор отклоняет sites); type — тип из
// blocks section.json; settings — правки мерчанта; hidden — скрыт. Нет ключа blocks — блоки по умолчанию.
const revisionBlockSchema = z.strictObject({
  id: z
    .string()
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
  hidden: z.boolean().optional(),
});
export const instanceSchema = z.strictObject({
  id: z
    .string()
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  section: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
  hidden: z.boolean().optional(),
  name: z.string().optional(),
  blocks: z.array(revisionBlockSchema).optional(),
  // Часть 5 блока 1 (Р1-5-6): изменённые общие настройки секции — значения проверяет resolveWrapper при сборке.
  wrapper: z.record(z.string(), z.unknown()).optional(),
});
export type SectionInstance = z.infer<typeof instanceSchema>;
const placementSchema = z.record(z.string().regex(/^[a-z0-9-]+$/), z.array(instanceSchema));
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

interface ShopPlacement {
  placement: Placement;
  menus: RevisionMenu[];
}

const issuesText = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join('; ');

// Места секций и меню магазина. null — ключ sections не той формы: его пишет конструктор, причина — в журнале. Меню не
// той формы — меню нет, строка журнала menus-invalid; сборка идёт (Р1-4-3).
async function readPlacement(deps: CodeDeps, shopId: string): Promise<ShopPlacement | null> {
  const { rows } = await deps.db.query(PLACEMENT_SQL, [shopId]);
  const row = rows.map((item) => placementRow.parse(item)).at(0);
  const parsed = placementSchema.safeParse(row?.sections ?? {});
  if (!parsed.success) {
    deps.log('sections-invalid', { shopId, error: issuesText(parsed.error) });
    return null;
  }
  const menus = revisionMenusSchema.safeParse(row?.menus ?? []);
  if (!menus.success) deps.log('menus-invalid', { shopId, error: issuesText(menus.error) });
  return { placement: parsed.data, menus: menus.success ? menus.data : [] };
}

// Видимая строка реестра и она же в формате SDK 1 (currentSection).
type VisibleRow = [SectionRow, CurrentSection];

export interface CodeContext {
  shell: ShellBuild;
  log: Log;
  shopId: string;
}

const sectionOf = ([row, current]: VisibleRow): CodeSection => ({
  name: row.name,
  kind: row.kind,
  hash: row.contentHash,
  render: current.renderHash,
  script: row.scriptHash,
  // Часть 4: флаги section.json — только если объявлены, иначе входы и ключ прежние.
  ...(current.manifest.removable === undefined ? {} : { removable: current.manifest.removable }),
  ...(current.manifest.uses === undefined ? {} : { uses: current.manifest.uses }),
  // Свои токены секции (блок 4, Р4-10) — только если объявлены в section.json.
  ...(current.manifest.tokens === undefined ? {} : { tokens: current.manifest.tokens }),
});

// Файл скрипта — текст готового модуля из строки реестра: те же байты хранятся в storefront/blobs (приём, задача 10).
const moduleOf = ([row]: VisibleRow): [string, Uint8Array][] =>
  row.script === null || row.scriptHash === null ? [] : [[row.scriptHash, Buffer.from(row.script, 'utf8')]];

// Модуль рендера — текст скомпилированного шаблона из строки реестра, по отпечатку.
const renderOf = ([, current]: VisibleRow): [string, string][] =>
  current.render === null || current.renderHash === null ? [] : [[current.renderHash, current.render]];

// Строки SDK 1 по имени. Строки до SDK 1 сборка не использует — строка журнала section-old-format.
function currentRows(rows: readonly SectionRow[], context: CodeContext): Map<string, VisibleRow> {
  const current = new Map<string, VisibleRow>();
  for (const row of rows) {
    const section = currentSection(row);
    if (section === null) context.log('section-old-format', { shopId: context.shopId, section: row.name });
    else current.set(row.name, [row, section]);
  }
  return current;
}

// Экземпляр на странице: значения настроек — правки мерчанта поверх умолчаний секции. Неверная правка — умолчание и
// строка журнала section-settings-invalid; сборка идёт.
function placedOf(
  instance: SectionInstance,
  current: CurrentSection,
  context: CodeContext,
  menus: readonly RevisionMenu[],
): CodeInstance {
  const resolved = resolveSectionSettings(settingFieldsOf(current.manifest.settings), instance.settings);
  if (resolved.invalid.length > 0)
    context.log('section-settings-invalid', {
      shopId: context.shopId,
      section: instance.section,
      id: instance.id,
      problems: resolved.invalid.join('; '),
    });
  const placed: CodeInstance = {
    id: instance.id,
    section: instance.section,
    settings: resolved.values,
    ...blocksOf(instance, current, context),
    ...menusOf(current, resolved.values, menus),
    ...wrapperOf(instance, current, context),
  };
  return instance.hidden === true ? { ...placed, hidden: true } : placed;
}

// Вид обёртки экземпляра (часть 5 блока 1, Р1-5-6…Р1-5-8): правки общих настроек поверх умолчаний → классы и атрибуты.
// Вид по умолчанию (py-section, без атрибутов) во входы не пишется; неверная правка — строка журнала
// section-wrapper-invalid, сборка идёт. Зовёт и превью блока (shop-preview.ts) — без журнала.
export function wrapperOf(
  instance: SectionInstance,
  current: CurrentSection,
  context?: Pick<CodeContext, 'log' | 'shopId'>,
): Pick<CodeInstance, 'wrapper'> {
  const resolved = resolveWrapperView(current.manifest, instance.wrapper);
  if (resolved.invalid.length > 0 && context !== undefined)
    context.log('section-wrapper-invalid', {
      shopId: context.shopId,
      section: instance.section,
      id: instance.id,
      problems: resolved.invalid.join('; '),
    });
  return isDefaultWrapperView(resolved.view) ? {} : { wrapper: resolved.view };
}

// Блоки экземпляра (часть 3, Р55, Р56): показанные, со значениями. У секции без blocks в section.json ключа нет; пустой
// invalid — без строки журнала, непустой — section-blocks-invalid, как section-settings-invalid; сборка идёт.
function blocksOf(
  instance: SectionInstance,
  current: CurrentSection,
  context: CodeContext,
): Pick<CodeInstance, 'blocks'> {
  if (current.manifest.blocks === undefined) return {};
  const resolved = resolveSectionBlocks(current.manifest, instance.blocks);
  if (resolved.invalid.length > 0)
    context.log('section-blocks-invalid', {
      shopId: context.shopId,
      section: instance.section,
      id: instance.id,
      problems: resolved.invalid.join('; '),
    });
  return { blocks: resolved.blocks };
}

// Код из видимых строк: экземпляры секций на страницах (экземпляр без видимой секции пропускается: расширение
// выключили, своя секция ещё не опубликована) и все глобальные скрипты. Ядро секций — всегда (часть 5б): аналитика — в
// бандле каждой страницы опубликованного сайта.
export function codeOf(
  rows: readonly SectionRow[],
  placement: Placement,
  context: CodeContext,
  menus: readonly RevisionMenu[] = [],
): Omit<ShopCode, 'extensions'> {
  const visible = currentRows(rows, context);
  const placedOn = (list: string, instances: readonly SectionInstance[]): CodeInstance[] =>
    allowedOn(list, instances, visible, context).map(([instance, current]) =>
      placedOf(instance, current, context, menus),
    );
  const pages = Object.fromEntries(
    Object.entries(placement).map(([page, instances]): [string, CodeInstance[]] => [page, placedOn(page, instances)]),
  );
  const placed = new Set(Object.values(pages).flatMap((instances) => instances.map((instance) => instance.section)));
  const used = [...visible.values()].filter(([row]) => row.kind === 'global' || placed.has(row.name));
  const globals = used.filter(([row]) => row.kind === 'global').map(([row]) => row.name);
  const modules = new Map(used.flatMap(moduleOf));
  const renders = new Map(used.flatMap(renderOf));
  const { shell } = context;
  const input = { version: shell.version, hash: shell.hash, parts: shell.parts };
  const code = { sections: used.map(sectionOf), pages, globals };
  return { shell: input, code, assets: { shell, modules, renders } };
}

// Код магазина целиком. null — не получен: расширения не ответили или места не той формы.
export async function readShopCode(deps: CodeDeps, shopId: string): Promise<ShopCode | null> {
  const [extensions, read] = await Promise.all([enabledExtensions(deps, shopId), readPlacement(deps, shopId)]);
  if (extensions === null || read === null) return null;
  const visibility = { shopId, extensions };
  const rows = await visibleSections(deps.db, visibility);
  const context = { shell: deps.shell, log: deps.log, shopId };
  return { ...codeOf(rows, read.placement, context, read.menus), extensions };
}

// Секции SDK 1, видимые магазину, по имени — для превью одного блока и списка секций конструктора (блок 1 «Секций и
// SDK»). Порядок — по имени, как отдаёт реестр. null — расширения не ответили.
export async function readVisibleSections(deps: CodeDeps, shopId: string): Promise<Map<string, CurrentSection> | null> {
  const extensions = await enabledExtensions(deps, shopId);
  if (extensions === null) return null;
  const rows = await visibleSections(deps.db, { shopId, extensions });
  return new Map(
    rows.flatMap((row): [string, CurrentSection][] => {
      const current = currentSection(row);
      return current === null ? [] : [[row.name, current]];
    }),
  );
}

// Группа списка ревизии (часть 4, Р1-4-2): header — шапка, footer — подвал, остальные списки — страницы.
const groupOf = (list: string): SectionGroup => (list === 'header' || list === 'footer' ? list : 'page');

// Экземпляры списка, которые встают на страницу: видимая секция (не глобальный скрипт), её группы включают группу
// списка, экземпляров секции в списке не больше limit — по порядку, скрытые считаются. Остальные — строка журнала
// section-group-invalid или section-limit-exceeded; сборка идёт.
function allowedOn(
  list: string,
  instances: readonly SectionInstance[],
  visible: ReadonlyMap<string, VisibleRow>,
  context: CodeContext,
): [SectionInstance, CurrentSection][] {
  const counts = new Map<string, number>();
  return instances.flatMap((instance): [SectionInstance, CurrentSection][] => {
    const entry = visible.get(instance.section);
    if (entry === undefined || entry[0].kind !== 'section') return [];
    const [, current] = entry;
    const fields = { shopId: context.shopId, section: instance.section, id: instance.id, list };
    if (!sectionGroupsOf(current.manifest).includes(groupOf(list))) {
      context.log('section-group-invalid', fields);
      return [];
    }
    const count = (counts.get(instance.section) ?? 0) + 1;
    counts.set(instance.section, count);
    if (count > (current.manifest.limit ?? Number.POSITIVE_INFINITY)) {
      context.log('section-limit-exceeded', fields);
      return [];
    }
    return [[instance, current]];
  });
}

// Деревья меню экземпляра (часть 4, Р1-4-3): только у секций с настройками вида menu.
function menusOf(
  current: CurrentSection,
  values: Readonly<Record<string, unknown>>,
  menus: readonly RevisionMenu[],
): Pick<CodeInstance, 'menus'> {
  const trees = sectionMenus(settingFieldsOf(current.manifest.settings), values, menus);
  return Object.keys(trees).length === 0 ? {} : { menus: trees };
}
