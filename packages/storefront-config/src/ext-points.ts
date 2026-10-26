import { z } from 'zod';
import { FUNCTION_NAME, extIdSchema } from './extensions';

// Места блоков расширений на витрине (блок 15 «Секций и SDK», часть 15д, Р15д-1, Р15д-5; design.md блока 7, С7-21 А):
// описания мест cart, account, orders и product из раздела storefront манифеста включённого расширения. Их вписывает
// сборка: сборщик витрин читает раздел нестрогим читателем extensionPointsOf (поле не того вида пропускается), сборка
// пишет в конфиг страницы места частей её бандла. Части ядра points, records и purchase читают их из конфига. Схема —
// строгая. Имён расширений здесь нет.
export const EXT_POINT_NAMES = ['cart', 'account', 'orders', 'product'] as const;
export type ExtPointName = (typeof EXT_POINT_NAMES)[number];

const LIMITS = { text: 500, key: 64, word: 32, fields: 20, columns: 10 } as const;
const fnSchema = z.string().regex(FUNCTION_NAME);
const textSchema = z.string().min(1).max(LIMITS.text);
const keySchema = z.string().min(1).max(LIMITS.key);
const wordSchema = z.string().min(1).max(LIMITS.word);

// Поле кабинета: ключ значения, подпись, вид значения (date — дата), вид ввода формы; required — только true.
const fieldSchema = z.strictObject({
  key: keySchema,
  label: textSchema.optional(),
  kind: wordSchema.optional(),
  input: wordSchema.optional(),
  required: z.literal(true).optional(),
});
const fieldsSchema = z.array(fieldSchema).min(1).max(LIMITS.fields);

// cart — заметка корзины: текст с {ключ} из view корзины расширения; when — ключ view, ложное значение — заметки нет.
const cartPointSchema = z.strictObject({
  note: z.strictObject({ text: textSchema, when: keySchema.optional() }),
});
// account — блок кабинета: заголовок, функция значений, поля, копирование, список и форма функции.
const accountPointSchema = z.strictObject({
  title: textSchema.optional(),
  source: fnSchema.optional(),
  fields: fieldsSchema.optional(),
  copy: z.strictObject({ key: keySchema, label: textSchema.optional() }).optional(),
  list: z.strictObject({ source: fnSchema, columns: z.array(keySchema).max(LIMITS.columns) }).optional(),
  form: z.strictObject({ fn: fnSchema, fields: fieldsSchema.optional() }).optional(),
});
// orders — записи в «Моих заказах»: функции списка и записи.
const ordersPointSchema = z.strictObject({ list: fnSchema, get: fnSchema });
// product — форма вместо «В корзину»: функция формы; отправку зовёт секция расширения через ctx.ext.
const productPointSchema = z.strictObject({ form: fnSchema });

export const extensionPointsSchema = z.strictObject({
  cart: cartPointSchema.optional(),
  account: accountPointSchema.optional(),
  orders: ordersPointSchema.optional(),
  product: productPointSchema.optional(),
});
export const storefrontExtPointsSchema = z.record(extIdSchema, extensionPointsSchema);
export type ExtensionPoints = z.infer<typeof extensionPointsSchema>;
export type StorefrontExtPoints = z.infer<typeof storefrontExtPointsSchema>;

type AccountPoint = NonNullable<ExtensionPoints['account']>;
type AccountField = NonNullable<AccountPoint['fields']>[number];

export interface ExtensionPointsRead {
  points: ExtensionPoints;
  // места, которые были в разделе, но не прошли схему — по порядку EXT_POINT_NAMES
  invalid: ExtPointName[];
}

// Раздел storefront манифеста — объект, не массив.
const isSection = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Непустая строка; остальное — как отсутствие поля.
const wordOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

// Поле кабинета: без непустого ключа поля нет; label, kind и input — только непустые строки; required — только true.
const accountFieldOf = (value: unknown): AccountField | undefined => {
  if (!isSection(value)) return undefined;
  const key = wordOf(value.key);
  if (key === undefined) return undefined;
  const label = wordOf(value.label);
  const kind = wordOf(value.kind);
  const input = wordOf(value.input);
  return {
    key,
    ...(label === undefined ? {} : { label }),
    ...(kind === undefined ? {} : { kind }),
    ...(input === undefined ? {} : { input }),
    ...(value.required === true ? { required: true } : {}),
  };
};

// Поля формы и кабинета: пустой список — поля отсутствуют.
const accountFieldsOf = (value: unknown): AccountField[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const fields = value.flatMap((item): AccountField[] => {
    const field = accountFieldOf(item);
    return field === undefined ? [] : [field];
  });
  return fields.length === 0 ? undefined : fields;
};

// Копирование: без непустого key — ключа нет.
const copyOf = (value: unknown): AccountPoint['copy'] => {
  if (!isSection(value)) return undefined;
  const key = wordOf(value.key);
  if (key === undefined) return undefined;
  const label = wordOf(value.label);
  return { key, ...(label === undefined ? {} : { label }) };
};

// Список: без функции источника ключа нет; колонки — только непустые строки.
const listOf = (value: unknown): AccountPoint['list'] => {
  if (!isSection(value)) return undefined;
  const source = wordOf(value.source);
  if (source === undefined) return undefined;
  const columns = Array.isArray(value.columns)
    ? value.columns.flatMap((column): string[] => (typeof column === 'string' && column !== '' ? [column] : []))
    : [];
  return { source, columns };
};

// Форма: без имени функции ключа нет.
const formOf = (value: unknown): AccountPoint['form'] => {
  if (!isSection(value)) return undefined;
  const fn = wordOf(value.fn);
  if (fn === undefined) return undefined;
  const fields = accountFieldsOf(value.fields);
  return { fn, ...(fields === undefined ? {} : { fields }) };
};

// Кабинет: ни заголовка, ни функции, ни полей, ни копирования, ни списка, ни формы — места нет.
const accountOf = (value: unknown): AccountPoint | undefined => {
  if (!isSection(value)) return undefined;
  const title = wordOf(value.title);
  const source = wordOf(value.source);
  const fields = accountFieldsOf(value.fields);
  const copy = copyOf(value.copy);
  const list = listOf(value.list);
  const form = formOf(value.form);
  const place = {
    ...(title === undefined ? {} : { title }),
    ...(source === undefined ? {} : { source }),
    ...(fields === undefined ? {} : { fields }),
    ...(copy === undefined ? {} : { copy }),
    ...(list === undefined ? {} : { list }),
    ...(form === undefined ? {} : { form }),
  };
  return Object.keys(place).length === 0 ? undefined : place;
};

// Заметка корзины: без непустого текста места нет.
const cartOf = (value: unknown): ExtensionPoints['cart'] | undefined => {
  if (!isSection(value) || !isSection(value.note)) return undefined;
  const text = wordOf(value.note.text);
  if (text === undefined) return undefined;
  const when = wordOf(value.note.when);
  return { note: { text, ...(when === undefined ? {} : { when }) } };
};

// Записи «Моих заказов»: нужны обе функции — списка и записи.
const ordersOf = (value: unknown): ExtensionPoints['orders'] | undefined => {
  if (!isSection(value)) return undefined;
  const list = wordOf(value.list);
  const get = wordOf(value.get);
  return list === undefined || get === undefined ? undefined : { list, get };
};

// Форма вместо «В корзину»: нужна функция формы.
const productOf = (value: unknown): ExtensionPoints['product'] | undefined => {
  if (!isSection(value)) return undefined;
  const form = wordOf(value.form);
  return form === undefined ? undefined : { form };
};

// Проверка одного места схемой: point — место прошло, bad — не прошло (в invalid), none — места нет.
type Checked<T> = { readonly point: T } | { readonly bad: true } | { readonly none: true };
const checkedPlace = <T>(candidate: T | undefined, schema: z.ZodType<T>): Checked<T> => {
  if (candidate === undefined) return { none: true };
  return schema.safeParse(candidate).success ? { point: candidate } : { bad: true };
};

// Шаг места: разбор — и запись в точки или invalid; ключи точек — конкретные, по месту.
type PlaceStep = (section: Record<string, unknown>, points: ExtensionPoints, invalid: ExtPointName[]) => void;
const stepOf =
  <T>(write: (points: ExtensionPoints, point: T) => void, place: ExtPointName, read: (value: unknown) => T | undefined, schema: z.ZodType<T>): PlaceStep =>
  (section, points, invalid) => {
    const checked = checkedPlace(read(Reflect.get(section, place)), schema);
    if ('point' in checked) write(points, checked.point);
    else if ('bad' in checked) invalid.push(place);
  };

// Места по порядку EXT_POINT_NAMES: у каждого — свой разбор и своя схема.
const PLACE_STEPS: readonly PlaceStep[] = [
  stepOf((points, point) => {
    points.cart = point;
  }, 'cart', cartOf, cartPointSchema),
  stepOf((points, point) => {
    points.account = point;
  }, 'account', accountOf, accountPointSchema),
  stepOf((points, point) => {
    points.orders = point;
  }, 'orders', ordersOf, ordersPointSchema),
  stepOf((points, point) => {
    points.product = point;
  }, 'product', productOf, productPointSchema),
];

// Места из раздела storefront манифеста как есть. Без побочных действий.
export function extensionPointsOf(storefront: unknown): ExtensionPointsRead {
  if (!isSection(storefront)) return { points: {}, invalid: [] };
  const points: ExtensionPoints = {};
  const invalid: ExtPointName[] = [];
  for (const step of PLACE_STEPS) step(storefront, points, invalid);
  return { points, invalid };
}
