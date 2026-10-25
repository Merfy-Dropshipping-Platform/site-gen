import { z } from 'zod';

// Сторы и методы расширений для секций (блок 9 «Секций и SDK», часть 9в; design.md блока 9, «Решил сам» п. 17) —
// описания из манифеста расширения (storefront.stores, storefront.methods). Сервис extensions проверил их при
// регистрации версии (src/registry/storefront-ext.ts), сборщик витрин читает их из extensions.enabledForShop и проверяет
// снова этой схемой. Сборка пишет в конфиг страницы только расширения из uses секций этой страницы. Имена и пределы —
// те же, что у extensions и merfy-sdk. Внутри конфига v1 поля только добавляются.
export const EXT_USE_PREFIX = 'ext:';
const EXT_ID = /^[a-z][a-z0-9-]{2,31}$/;
const EXT_MEMBER = /^[a-z][a-zA-Z0-9]{0,31}$/;
const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const STOREFRONT_EVENT = /^merfy:[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*$/;
const MARKUP_PARAM = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LIMITS = { stores: 20, methods: 20, refreshOn: 10, params: 10 } as const;

const extIdSchema = z
  .string()
  .regex(EXT_ID, { error: 'id расширения: строчные латинские буквы, цифры и дефис, 3–32 знака' });

// "ext:<id>" в uses секции: скрипту секции нужен ctx.ext.<id>.
export const extUseSchema = z.templateLiteral([EXT_USE_PREFIX, extIdSchema]);
export type ExtUse = z.infer<typeof extUseSchema>;

// Стор: функция расширения; by: product — стор на товар; customer — только вошедшему покупателю; refreshOn — события
// витрины, после которых стор читается заново.
const storeSchema = z.strictObject({
  fn: z.string().regex(FUNCTION_NAME),
  by: z.literal('product').optional(),
  customer: z.literal(true).optional(),
  refreshOn: z.array(z.string().regex(STOREFRONT_EVENT)).max(LIMITS.refreshOn).optional(),
});
// Метод: функция расширения; params — data-атрибуты для data-action="ext.<id>.<метод>".
const methodSchema = z.strictObject({
  fn: z.string().regex(FUNCTION_NAME),
  customer: z.literal(true).optional(),
  params: z.array(z.string().regex(MARKUP_PARAM)).max(LIMITS.params).optional(),
});
const members = <T extends z.ZodType>(entry: T, limit: number) =>
  z
    .record(z.string().regex(EXT_MEMBER), entry)
    .refine((value) => Object.keys(value).length <= limit, { error: `не больше ${limit}` });

export const extensionStorefrontSchema = z.strictObject({
  stores: members(storeSchema, LIMITS.stores),
  methods: members(methodSchema, LIMITS.methods),
});
export const storefrontExtensionsSchema = z.record(extIdSchema, extensionStorefrontSchema);
export type ExtensionStorefront = z.infer<typeof extensionStorefrontSchema>;
export type StorefrontExtensions = z.infer<typeof storefrontExtensionsSchema>;
