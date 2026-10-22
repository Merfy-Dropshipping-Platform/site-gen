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

// Принятая правка секции из реестра (storefront_section): отпечаток правки, отпечаток модуля рендера (у секции; у
// глобального скрипта — null) и отпечаток файла скрипта; null — секция без скрипта (п. 16).
const codeSectionSchema = z.strictObject({
  name: sectionNameSchema,
  kind: z.enum(CODE_KINDS),
  hash: hashSchema,
  render: hashSchema.nullable(),
  script: hashSchema.nullable(),
  // Часть 4 (Р1-4-2): флаги section.json — только если объявлены, иначе входы и ключ прежние.
  removable: z.literal(false).optional(),
  uses: z.array(z.enum(['theme', 'shop'])).optional(),
});

// Экземпляр секции на странице (блок 1 «Секций и SDK», В1-1 А): id на странице, имя секции и значения всех настроек —
// правки мерчанта поверх умолчаний, их сводит сборщик.
// hidden — экземпляр скрыт (п. 22): его убирает renderShopPage. Имени мерчанта (name) во входах сборки нет (Р17).
// blocks — показанные блоки со значениями (часть 3, Р55, Р56): только у секций с blocks в section.json; скрытых блоков
// во входах нет — их убрал сборщик.
const valuesSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));
// Дерево меню (часть 4, Р1-4-3): три уровня, у пункта последнего уровня пунктов нет.
const menuLeafSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.tuple([]) });
const menuMiddleSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.array(menuLeafSchema) });
const menuItemSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.array(menuMiddleSchema) });
const menuTreeSchema = z.strictObject({ title: z.string(), items: z.array(menuItemSchema) });
// Своя страница (часть 4, Р1-4-8): id, адрес /o-nas, имя и SEO страницы.
const PAGE_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pageSchema = z.strictObject({
  id: kebabIdSchema,
  slug: z.string().regex(PAGE_SLUG, { error: 'нужен адрес вида /o-nas: строчные латинские буквы и цифры через дефис' }),
  name: z.string().max(SHOP_NAME_MAX),
  seo: z.strictObject({ title: z.string(), description: z.string(), keywords: z.string() }),
});
const instanceSchema = z.strictObject({
  id: kebabIdSchema,
  section: sectionNameSchema,
  settings: valuesSchema,
  hidden: z.literal(true).optional(),
  blocks: z.array(z.strictObject({ id: kebabIdSchema, type: kebabIdSchema, settings: valuesSchema })).optional(),
  // Часть 4 (Р1-4-3): деревья меню по id настройки вида menu — только у секций с такими настройками.
  menus: z.record(kebabIdSchema, menuTreeSchema).optional(),
});

// Код магазина: видимые ему секции, которые где-то стоят, и глобальные скрипты. Места — экземпляры секций по id страницы
// в порядке мерчанта, секция может стоять дважды; у глобальных скриптов места нет (С7-21 А).
const codeSchema = z.strictObject({
  sections: z.array(codeSectionSchema),
  pages: z.record(kebabIdSchema, z.array(instanceSchema)),
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
  // Версия библиотеки шрифтов (блок 12, «решил сам» 13) — отпечаток реестра FONT_LIBRARY_HASH (src/fonts.ts).
  fonts: hashSchema,
  // Код секций магазина (блок 7).
  code: codeSchema,
  // Ревизия мерчанта — по содержимому, не по id (факт 6): правки токенов (блок 1); правки настроек темы — их читают
  // секции с "uses": ["theme"], и свои страницы (часть 4 блока 1 «Секций и SDK»).
  revision: z.strictObject({
    tokens: jsonObject,
    settings: jsonObject.optional(),
    pages: z.array(pageSchema).optional(),
  }),
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
export type CodeInstance = z.infer<typeof instanceSchema>;
export type RevisionPage = z.infer<typeof pageSchema>;
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
  ...Object.entries(code.pages).flatMap(([page, instances]) =>
    instances.map((instance, index) => place(`code.pages.${page}.${index}`, instance.section, 'section')),
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

// Модуль рендера есть у секции и нет у глобального скрипта: сборщик такого не пишет.
const HAS_RENDER: Record<CodeKind, boolean> = { section: true, global: false };
const RENDER_TEXT: Record<CodeKind, string> = {
  section: 'у секции нет модуля рендера',
  global: 'у глобального скрипта модуля рендера не бывает',
};

const renderIssues = (code: CodeInput): CodeIssue[] =>
  code.sections.flatMap((section, index) =>
    (section.render !== null) === HAS_RENDER[section.kind]
      ? []
      : [{ path: `code.sections.${index}.render`, text: `${section.name}: ${RENDER_TEXT[section.kind]}` }],
  );

// id экземпляра — один раз на странице: по нему конструктор выбирает и правит секцию.
const repeatedIds = (code: CodeInput): CodeIssue[] =>
  Object.entries(code.pages).flatMap(([page, instances]) =>
    instances.flatMap((instance, index) =>
      instances.findIndex((other) => other.id === instance.id) === index
        ? []
        : [{ path: `code.pages.${page}.${index}.id`, text: `id ${instance.id} на странице ${page} дважды` }],
    ),
  );

// Код приходит из реестра через сборщик: имя — один раз, место на странице — секция из кода, строка globals —
// глобальный скрипт из кода, модуль рендера — у каждой секции, id экземпляра — один раз на странице, скрипты — только
// при ядре. Первая ошибка — с путём.
function checkCode(inputs: BuildInputs): void {
  const code = inputs.code;
  const issues = [...twice(code), ...misplaced(code), ...renderIssues(code), ...repeatedIds(code)];
  const issue = [...issues, ...scriptsWithoutShell(inputs)].at(0);
  if (issue === undefined) return;
  throw new StorefrontBuildError('code-invalid', issue.text, { path: issue.path });
}

// Входы — внешние данные: схема, потом признак «получен», потом одна сущность — один раз, потом код секций.
export function parseBuildInputs(raw: unknown): BuildInputs {
  const inputs = parseWith(buildInputsSchema, raw, 'inputs-invalid');
  checkReceived(inputs);
  checkUniqueEntities(inputs.data.entities);
  checkCode(inputs);
  checkPages(inputs);
  return inputs;
}

// Свои страницы (часть 4, Р1-4-8): id — один раз и не главная, шапка или подвал (их списки секций); адрес — один раз
// и не стенд темы (STAND_PAGE_PATH, renderer.ts). Первая ошибка — с путём.
const RESERVED_PAGE_IDS: ReadonlySet<string> = new Set(['home', 'header', 'footer']);
const RESERVED_SLUGS: ReadonlySet<string> = new Set(['/theme-stand']);

function checkPages(inputs: BuildInputs): void {
  const pages = inputs.revision.pages ?? [];
  const issue = pages
    .flatMap((page, index): CodeIssue[] => {
      const path = `revision.pages.${index}`;
      if (RESERVED_PAGE_IDS.has(page.id) || pages.findIndex((other) => other.id === page.id) !== index)
        return [{ path: `${path}.id`, text: `id страницы ${page.id} занят` }];
      if (RESERVED_SLUGS.has(page.slug) || pages.findIndex((other) => other.slug === page.slug) !== index)
        return [{ path: `${path}.slug`, text: `адрес ${page.slug} занят` }];
      return [];
    })
    .at(0);
  if (issue !== undefined) throw new StorefrontBuildError('inputs-invalid', issue.text, { path: issue.path });
}
