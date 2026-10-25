import { z } from 'zod';
import { parseWith } from './parse';

// Форматы объектов хранилища, версия 1 (design.md блока 5). Указатель, таблицу раздачи и списки читает раздача —
// njs в nginx-minio-proxy (storefront/njs/route.js): поля короткие, их меняют вместе.

export const FORMAT_VERSION = 1;
// В истории указателя — не больше 20 прошлых живых сборок: откатывают на одну-две назад.
export const HISTORY_LIMIT = 20;
export const CACHE_CLASSES = ['immutable', 'revalidate'] as const;

const hexSchema = z.string().regex(/^[0-9a-f]{64}$/, { error: 'отпечаток — 64 знака hex' });
const instantSchema = z.iso.datetime({ offset: false, error: 'дата — ISO в UTC, с Z на конце' });
const routePathSchema = z.string().startsWith('/', { error: 'путь начинается с /' });
const numberSchema = z.int().positive();

// Строка файла: отпечаток, тип содержимого, кэш, у страницы — дата правки её данных (из неё Last-Modified).
const fileRowSchema = z.strictObject({
  h: hexSchema,
  t: z.string().min(1),
  c: z.enum(CACHE_CLASSES),
  m: instantSchema.optional(),
  // Страница со списком (блок 11 «Секций и SDK», часть 11а): параметры списка раздача отдаёт рендеру по запросу
  // (nginx-minio-proxy, storefront/njs/route.js, listAnswer). Нет ключа — обычный файл.
  l: z.literal(true).optional(),
});

// Указатель «магазин → живая сборка». newest — самый новый номер сборки, что когда-либо выкладывался: «только если
// новее» сравнивает с ним, поэтому после отката старая застрявшая сборка всё равно не пройдёт. rev растёт с каждой
// записью: состояние не повторяется байт в байт, и запись по устаревшему отпечатку не проходит (проба, задача 2).
// paused — выкладка на паузе после отката (В5-6 А); pending — готовая сборка, собранная во время паузы: снятие паузы
// выкладывает её. history — прошлые живые сборки, новые первыми: откат берёт первую.
const pointerSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  shop: z.uuid(),
  build: numberSchema,
  newest: numberSchema,
  rev: numberSchema,
  paused: z.boolean(),
  pending: numberSchema.nullable(),
  history: z.array(numberSchema).max(HISTORY_LIMIT),
});

// Таблица раздачи сборки: «путь → строка файла», переезды (301), удалённое (410, до даты), отпечаток страницы 404
// темы и версии, которыми собрана сборка, — по ним рисовальщик решает, можно ли дорисовать (Св-1 В).
const routesTableSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  shop: z.uuid(),
  build: numberSchema,
  versions: z.strictObject({ render: z.string().regex(/^sha256:[0-9a-f]{64}$/), theme: z.string().min(1) }),
  notFound: hexSchema.nullable(),
  // Хеш 502.html (блок 7 «Секций и SDK», часть 7а): раздача держит копию и отдаёт её при сбое. В таблицах до 7а ключа нет.
  unavailable: hexSchema.nullable().optional(),
  files: z.record(routePathSchema, fileRowSchema),
  moved: z.record(routePathSchema, routePathSchema),
  gone: z.record(routePathSchema, instantSchema),
  // Политика CSP сборки (блок 13 «Секций и SDK», часть 13б): раздача ставит её заголовком у HTML. Нет — заголовка нет.
  csp: z
    .string()
    .regex(/^[\x20-\x7e]{1,12288}$/, { error: 'CSP — печатные знаки ASCII, от 1 до 12 288' })
    .optional(),
});

const drawnListSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  rows: z.record(routePathSchema, fileRowSchema),
});
const entityListSchema = z.strictObject({ v: z.literal(FORMAT_VERSION), paths: z.array(routePathSchema) });

export type FileRow = z.infer<typeof fileRowSchema>;
export type CacheClass = FileRow['c'];
export type Pointer = z.infer<typeof pointerSchema>;
export type RoutesTable = z.infer<typeof routesTableSchema>;
export type DrawnList = z.infer<typeof drawnListSchema>;
export type EntityList = z.infer<typeof entityListSchema>;

export const parsePointer = (value: unknown, key: string): Pointer => parseWith(pointerSchema, value, key);
export const parseRoutesTable = (value: unknown, key: string): RoutesTable => parseWith(routesTableSchema, value, key);
export const parseDrawnList = (value: unknown, key: string): DrawnList => parseWith(drawnListSchema, value, key);
export const parseEntityList = (value: unknown, key: string): EntityList => parseWith(entityListSchema, value, key);
