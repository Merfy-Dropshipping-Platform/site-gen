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
export const ENTITY_TYPES = ['product', 'collection', 'policy', 'contacts', 'publication', 'billing'] as const;

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
  // Слот блока 7: версия каркаса входит в ключ. До блока 7 каркаса нет — null.
  shell: z.strictObject({ version: versionSchema }).nullable(),
  // Ревизия мерчанта — по содержимому, не по id (факт 6). Пока в ней только правки токенов (блок 1).
  revision: z.strictObject({ tokens: jsonObject }),
  site: z.strictObject({
    id: z.uuid(),
    name: z.string().min(1).max(SHOP_NAME_MAX),
    publicUrl: z.url({ protocol: /^https$/, error: 'нужен адрес https://…' }),
    description: z.string(),
    updatedAt: instantSchema,
  }),
  env: z.strictObject({
    apiUrl: z
      .url({ protocol: /^https?$/, error: 'нужен адрес http:// или https://' })
      .endsWith(API_SUFFIX, { error: 'адрес API должен кончаться на /api' }),
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

// Входы — внешние данные: схема, потом признак «получен», потом одна сущность — один раз.
export function parseBuildInputs(raw: unknown): BuildInputs {
  const inputs = parseWith(buildInputsSchema, raw, 'inputs-invalid');
  checkReceived(inputs);
  checkUniqueEntities(inputs.data.entities);
  return inputs;
}
