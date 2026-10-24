import { z } from 'zod';
import { hashSchema } from './canonical';
import { ENTITY_TYPES, instantSchema, kebabIdSchema, versionSchema } from './inputs';
import { parseWith } from './parse';

// Манифест сборки магазина v1 (design.md блока 4, В-4 А): ключ, версии платформы и темы, карта «сущность → хэш»,
// «путь → хэш файла» и строки страниц — граф «страница ← данные». Строка страницы того же формата отдаёт страница,
// нарисованная по запросу (Св-1 В); где такие строки лежат, решает блок 5 (В5-1).

export const MANIFEST_VERSION = 1;
// Страница принадлежит сайту (главная) или одной сущности: по ней раздача отвечает 301 и 410 (блок 5).
export const PAGE_ENTITY_TYPES = ['site', ...ENTITY_TYPES] as const;
export type PageEntityType = (typeof PAGE_ENTITY_TYPES)[number];

const COMMIT = /^[0-9a-f]{40}$/;
const ENTITY_KEY = new RegExp(`^(${PAGE_ENTITY_TYPES.join('|')}):.+$`);

// Путь файла — от корня сайта: без «/» в начале и без «..».
const isSitePath = (path: string): boolean => !path.startsWith('/') && !path.split('/').includes('..');

const entityKeySchema = z.string().regex(ENTITY_KEY, { error: 'ключ сущности — тип:id' });
const filePathSchema = z.string().min(1).refine(isSitePath, { error: 'путь файла — от корня сайта, без «/» и «..»' });
// Политика CSP (блок 13 «Секций и SDK», часть 13б): печатные знаки ASCII без переводов строки — значение заголовка.
const CSP_TEXT = /^[\x20-\x7e]{1,12288}$/;

const pageRowSchema = z.strictObject({
  path: z.string().startsWith('/'),
  file: filePathSchema,
  hash: hashSchema,
  entity: z.strictObject({ type: z.enum(PAGE_ENTITY_TYPES), id: z.string().min(1) }),
  // Ключи сущностей, из которых нарисована страница: правка любой — страницу перерисовать.
  deps: z.array(entityKeySchema),
  // Последняя правка данных страницы — из неё lastmod карты сайта (блок 5). Время сборки сюда не попадает (В4-5).
  dataUpdatedAt: instantSchema,
});

const manifestShape = z.strictObject({
  v: z.literal(MANIFEST_VERSION),
  key: hashSchema,
  // Ключ данных (блок 10): ключ без кода платформы — по нему сверка сборщика ищет потерянные события. У сборок до
  // блока 10 поля нет.
  dataKey: hashSchema.optional(),
  // Коммит — справка для людей и поезда выпуска; в ключ входит только renderHash (В4-1 В).
  platform: z.strictObject({
    commit: z.string().regex(COMMIT, { error: 'нужен полный коммит: 40 знаков hex' }),
    renderHash: hashSchema,
  }),
  theme: z.strictObject({ id: kebabIdSchema, version: versionSchema, contentHash: hashSchema }),
  shell: z.strictObject({ version: versionSchema }).nullable(),
  // Включённые расширения магазина и их версии (блок 10): по ним выпуск расширения видит, дошёл ли магазин.
  extensions: z.array(z.strictObject({ id: z.string().min(1), version: z.string().min(1) })).optional(),
  shop: z.strictObject({ id: z.uuid() }),
  entities: z.record(entityKeySchema, hashSchema),
  files: z.record(filePathSchema, hashSchema),
  pages: z.array(pageRowSchema),
  // Политика CSP магазина (часть 13б) — заголовок раздачи у HTML. Нет поля — у сборки нет политики: сборки до 13б и
  // политика длиннее предела (csp.ts).
  csp: z.string().regex(CSP_TEXT, { error: 'CSP — печатные знаки ASCII, от 1 до 12 288' }).optional(),
});

type ManifestShape = z.infer<typeof manifestShape>;
type PageIssue = { path: (string | number)[]; message: string };

// Строки страниц сходятся с остальным манифестом: файл страницы — в files с тем же хэшем, зависимости — в entities.
const hashIssues = (manifest: ManifestShape): PageIssue[] =>
  manifest.pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => manifest.files[page.file] !== page.hash)
    .map(({ page, index }) => ({
      path: ['pages', index, 'hash'],
      message: `хэш не совпадает с files["${page.file}"]`,
    }));

const depIssues = (manifest: ManifestShape): PageIssue[] =>
  manifest.pages.flatMap((page, index) =>
    page.deps
      .filter((dep) => !(dep in manifest.entities))
      .map((dep) => ({ path: ['pages', index, 'deps'], message: `сущности ${dep} нет в entities` })),
  );

export const manifestSchema = manifestShape.superRefine((manifest, context) => {
  const issues = [...hashIssues(manifest), ...depIssues(manifest)];
  issues.forEach((issue) => context.addIssue({ code: 'custom', ...issue }));
});

export type StorefrontManifest = z.infer<typeof manifestSchema>;
export type PageRow = z.infer<typeof pageRowSchema>;

export const checkManifest = (value: unknown): StorefrontManifest =>
  parseWith(manifestSchema, value, 'manifest-invalid');
export const checkPageRow = (value: unknown): PageRow => parseWith(pageRowSchema, value, 'manifest-invalid');
