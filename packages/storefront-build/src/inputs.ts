import { z } from 'zod';
import { hashSchema } from './canonical';
import { entityKey } from './entities';
import { StorefrontBuildError } from './errors';
import { parseWith } from './parse';

// Входы сборки магазина новой темы (design.md блока 4, В4-3 Б): всё, от чего зависят файлы, — явно и в одном месте.
// Таблица входов — эта схема: ключ сборки считается по ней целиком, тест ключа правит каждый её лист. Новый вход —
// новое поле здесь и строка в тесте ключа.

// Сущности снимка данных (В4-2 Б) — весь контент из событий пересборки блока 3: товар (с остатком), коллекция,
// политика (id — тип политики), контакты, публикация блога, касса магазина (настройки оплаты из сервиса billing).
// Счётчик мерчанта (блок 11, С11-4 Б): id — счётчик у сборщика аналитики, данные — вид и номер.
export const ENTITY_TYPES = [
  'product',
  'collection',
  'policy',
  'contacts',
  'publication',
  'billing',
  'counter',
] as const;

// Правила id, версии, адресов — те же, что у конфига витрины (блок 3): входы проходят его писатель без сюрпризов.
const KEBAB_ID = /^[a-z0-9-]+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const SHOP_NAME_MAX = 200;
const API_SUFFIX = '/api';
const YEAR_MIN = 2000;
const YEAR_MAX = 9999;

// Форматы id, версии и даты — общие с манифестом и записью версий тем.
export const kebabIdSchema = z.string().regex(KEBAB_ID, { error: 'нужны строчные латинские буквы, цифры и дефис' });
export const versionSchema = z.string().regex(SEMVER, { error: 'нужна версия semver: 1.2.3' });
// Дата правки — только UTC с миллисекундами: одна и та же минута не пишется двумя способами и не меняет хэш.
export const instantSchema = z.iso.datetime({
  precision: 3,
  error: 'нужна дата UTC с миллисекундами: 2026-10-06T09:00:00.000Z',
});
const jsonObject = z.record(z.string(), z.json());

// Код секций (design.md блока 7, п. 19 и 22): полное имя — приставка автора и имя секции, как в списке модулей ядра.
const SECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Файл сборки ядра: shell.js и part-<хэш>.js.
const SHELL_FILE = /^[A-Za-z0-9_-]+\.js$/;
const CODE_KINDS = ['section', 'global'] as const;
const sectionNameSchema = z.string().regex(SECTION_NAME, { error: 'нужно полное имя секции: nova:scarf-colors' });

// Ядро @merfy/shell: версия — для людей и манифеста; отпечаток файлов — путь _merfy/shell/<16 знаков>/ и ключ;
// подсказки modulepreload — файлы ядра, которые нужны сразу (dist/shell.json, задача 3 блока 7).
const shellSchema = z.strictObject({
  version: versionSchema,
  hash: hashSchema,
  preload: z.array(z.string().regex(SHELL_FILE)).min(1),
});

// Принятая правка секции из реестра блока 7 (storefront_section): отпечаток правки, разметка, стили в рамке секции и
// отпечаток файла скрипта; null — секция без скрипта (п. 16).
const codeSectionSchema = z.strictObject({
  name: sectionNameSchema,
  kind: z.enum(CODE_KINDS),
  hash: hashSchema,
  html: z.string(),
  css: z.string(),
  script: hashSchema.nullable(),
});

// Код магазина: видимые ему секции, которые где-то стоят, и глобальные скрипты. Места — по id страницы в порядке
// мерчанта, секция может стоять дважды; у глобальных скриптов места нет (С7-21 А).
const codeSchema = z.strictObject({
  sections: z.array(codeSectionSchema),
  pages: z.record(kebabIdSchema, z.array(sectionNameSchema)),
  globals: z.array(sectionNameSchema),
});

const entitySchema = z.strictObject({
  type: z.enum(ENTITY_TYPES),
  id: z.string().min(1),
  updatedAt: instantSchema,
  data: jsonObject,
});

const buildInputsSchema = z.strictObject({
  // Хэш кода рендера платформы (В4-1 В): пакеты, которые рисуют страницы новой темы.
  platform: z.strictObject({ renderHash: hashSchema }),
  // Версия — единица выпуска для людей и волн; отпечаток файлов темы — в ключе (В4-1 В).
  theme: z.strictObject({ id: kebabIdSchema, version: versionSchema, contentHash: hashSchema }),
  // Ядро @merfy/shell (блок 7). null — у магазина нет скриптов секций: ядро на страницы не идёт.
  shell: shellSchema.nullable(),
  // Код секций магазина (блок 7).
  code: codeSchema,
  // Ревизия мерчанта — по содержимому, не по id (факт 6). Пока в ней только правки токенов (блок 1).
  revision: z.strictObject({ tokens: jsonObject }),
  site: z.strictObject({
    id: z.uuid(),
    // Имя и SEO мерчант может оставить пустыми: страница берёт вместо имени адрес магазина, пустое SEO не рисует.
    name: z.string().max(SHOP_NAME_MAX),
    publicUrl: z.url({ protocol: /^https$/, error: 'нужен адрес https://…' }),
    // SEO главной из настроек магазина (site.branding.seo): описание, заголовок и ключевые слова.
    description: z.string(),
    seoTitle: z.string(),
    keywords: z.string(),
    // Логотип из брендинга (site.branding.logoUrl) — картинка для соцсетей (блок 9). Не загружен — пустая строка. Адрес
    // здесь не проверяется: негодный логотип сборку не валит, тега og:image просто нет (head.ts).
    logoUrl: z.string(),
    updatedAt: instantSchema,
  }),
  env: z.strictObject({
    apiUrl: z
      .url({ protocol: /^https?$/, error: 'нужен адрес http:// или https://' })
      .endsWith(API_SUFFIX, { error: 'адрес API должен кончаться на /api' }),
    // Сборщик аналитики (блок 11, И4): ANALYTICS_COLLECTOR_URL сборщика витрин, запасного адреса нет. Правило — как у
    // конфига (блок 3): http(s) без косой черты в конце.
    analyticsUrl: z
      .url({ protocol: /^https?$/, error: 'нужен адрес http:// или https://' })
      .refine((url) => !url.endsWith('/'), { error: 'адрес сборщика — без косой черты в конце' }),
  }),
  // Год копирайта — явный вход (В4-5 Б): 1 января магазины пересобираются волной, часов в рендере нет.
  year: z.int().min(YEAR_MIN).max(YEAR_MAX),
  // Снимок данных целиком (факты 7–8): received — все сервисы ответили, failed — нет, и сборки нет.
  data: z.strictObject({
    status: z.enum(['received', 'failed']),
    entities: z.array(entitySchema),
  }),
});

export type BuildInputs = z.infer<typeof buildInputsSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type EntityType = Entity['type'];
export type ShellInput = z.infer<typeof shellSchema>;
export type CodeInput = z.infer<typeof codeSchema>;
export type CodeSection = z.infer<typeof codeSectionSchema>;
type CodeKind = CodeSection['kind'];

function checkReceived(inputs: BuildInputs): void {
  if (inputs.data.status === 'received') return;
  throw new StorefrontBuildError('data-not-received', 'снимок данных не получен целиком: сборки нет', {
    path: 'data.status',
  });
}

function checkUniqueEntities(entities: readonly Entity[]): void {
  const seen = new Set<string>();
  entities.forEach((entity, index) => {
    const key = entityKey(entity.type, entity.id);
    if (seen.has(key)) {
      throw new StorefrontBuildError('entity-duplicate', `сущность ${key} уже есть в снимке`, {
        path: `data.entities.${index}`,
      });
    }
    seen.add(key);
  });
}

interface CodeIssue {
  path: string;
  text: string;
}

interface Place {
  path: string;
  name: string;
  kind: CodeKind;
}

const MISSING_TEXT: Record<CodeKind, string> = { section: 'такой секции', global: 'такого глобального скрипта' };
const place = (path: string, name: string, kind: CodeKind): Place => ({ path, name, kind });

// Где код ставит имя: место на странице ждёт секцию, строка globals — глобальный скрипт.
const placesOf = (code: CodeInput): Place[] => [
  ...Object.entries(code.pages).flatMap(([page, names]) =>
    names.map((name, index) => place(`code.pages.${page}.${index}`, name, 'section')),
  ),
  ...code.globals.map((name, index) => place(`code.globals.${index}`, name, 'global')),
];

const twice = (code: CodeInput): CodeIssue[] =>
  code.sections.flatMap((section, index) =>
    code.sections.findIndex((other) => other.name === section.name) === index
      ? []
      : [{ path: `code.sections.${index}`, text: `секция ${section.name} в коде дважды` }],
  );

function misplaced(code: CodeInput): CodeIssue[] {
  const kinds = new Map(code.sections.map((section): [string, CodeKind] => [section.name, section.kind]));
  return placesOf(code)
    .filter((entry) => kinds.get(entry.name) !== entry.kind)
    .map((entry) => ({ path: entry.path, text: `${entry.name}: в code.sections нет ${MISSING_TEXT[entry.kind]}` }));
}

// Скрипт без ядра не запустится: сборщик такого не пишет.
function scriptsWithoutShell(inputs: BuildInputs): CodeIssue[] {
  if (inputs.shell !== null) return [];
  return inputs.code.sections.flatMap((section, index) =>
    section.script === null ? [] : [{ path: `code.sections.${index}.script`, text: 'у секции скрипт, а ядра нет' }],
  );
}

// Код приходит из реестра блока 7 через сборщик: имя — один раз, место на странице — секция из кода, строка globals —
// глобальный скрипт из кода, скрипты — только при ядре. Первая ошибка — с путём.
function checkCode(inputs: BuildInputs): void {
  const issue = [...twice(inputs.code), ...misplaced(inputs.code), ...scriptsWithoutShell(inputs)].at(0);
  if (issue === undefined) return;
  throw new StorefrontBuildError('code-invalid', issue.text, { path: issue.path });
}

// Входы — внешние данные: схема, потом признак «получен», потом одна сущность — один раз, потом код секций.
export function parseBuildInputs(raw: unknown): BuildInputs {
  const inputs = parseWith(buildInputsSchema, raw, 'inputs-invalid');
  checkReceived(inputs);
  checkUniqueEntities(inputs.data.entities);
  checkCode(inputs);
  return inputs;
}
