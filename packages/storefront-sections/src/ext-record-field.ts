import { DATA_NAME, EXT_VALUE_LIMITS } from '@merfy/storefront-build';
import { z } from 'zod';

// Поле «запись расширения» (параметр секции вида ext-record): ссылка на запись, которую расширение объявило в манифесте
// (records.<вид>: подпись и функция списка). Значение в ревизии — id записи, пусто — "" или null; умолчание — null: записей
// расширения автор секции не знает. В отличие от product и collection, запись не разворачивается при сборке: данные записи
// живут у расширения, секция читает их стором by: "record" (ctx.ext.<id>.$имя(id)) — правка записи в кабинете видна на
// сайте без публикации. Поэтому в шаблоне и в ctx.settings значение — сам id. Выбор записи в конструкторе — список
// расширения через шлюз (GET records/<вид>/list).
export const EXT_RECORD_KIND = 'ext-record';

// id расширения и имя вида записи — как в манифесте расширения (extensions, registry/manifest.schema.ts, records.ts).
const EXT_ID = /^[a-z][a-z0-9-]{2,31}$/;
const RECORD_KIND = /^[a-z][a-zA-Z0-9]{0,31}$/;
// id записи — как у товара и коллекции в параметрах секции (record-fields.ts): буквы, цифры, «-» и «_», до 200 знаков.
const RECORD_ID = /^[\p{L}\p{N}_-]{1,200}$/u;

export const extRecordSpec = z.strictObject({
  kind: z.literal(EXT_RECORD_KIND),
  ext: z.string().regex(EXT_ID, { error: 'ext — id расширения: строчные латинские буквы, цифры и дефис, 3–32 знака' }),
  record: z.string().regex(RECORD_KIND, { error: 'record — вид записи из records манифеста расширения: латиница, с буквы' }),
  default: z.null().default(null),
});

export type ExtRecordSpec = z.infer<typeof extRecordSpec>;

// ext секции в section.json (prerender, 20.11): имя свойства шаблона → { from, store }. from — только параметр секции
// (settings.<id>): записи страницы у расширения нет. Смысл (from — параметр вида ext-record) — ext-values.ts.
export const EXT_FROM = /^settings\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXT_NAME_TEXT = 'имя — латинские буквы и цифры, первая — строчная: card';

const extEntryShape = z.strictObject({
  from: z.string().regex(EXT_FROM, { error: 'from — settings.<id параметра вида ext-record>' }),
  store: z.string().regex(RECORD_KIND, { error: 'store — имя стора из storefront.stores манифеста расширения' }),
});

export const sectionExtShape = z.record(z.string(), extEntryShape).superRefine((entries, context) => {
  const names = Object.keys(entries);
  for (const name of names.filter((key) => !DATA_NAME.test(key)))
    context.addIssue({ code: 'custom', path: [name], message: EXT_NAME_TEXT });
  if (names.length > EXT_VALUE_LIMITS.names)
    context.addIssue({ code: 'custom', message: `не больше ${EXT_VALUE_LIMITS.names} имён` });
});

export const extRecordText = (path: string, value: unknown): string | undefined =>
  value === null || value === '' || (typeof value === 'string' && RECORD_ID.test(value))
    ? undefined
    : `${path}: нужен id записи расширения: буквы, цифры, «-» и «_», до 200 знаков, или пусто`;
