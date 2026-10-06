import { z } from 'zod';

// Данные моков (design.md 5.7): ответы API витрины для локального стенда. Формы — как в
// packages/storefront/testing/mock-data и хуках витрины; цены — в копейках, целым числом.
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kopecks = z.int().nonnegative();
const text = z.string().min(1);

const imageSchema = z.object({ url: text, alt: z.string().optional() }).strict();

const variantSchema = z
  .object({
    id: text,
    title: text,
    price: kopecks,
    compareAtPrice: kopecks.optional(),
    available: z.boolean(),
    options: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const productSchema = z
  .object({
    id: text,
    handle: z.string().regex(KEBAB),
    title: text,
    description: z.string().optional(),
    price: kopecks,
    compareAtPrice: kopecks.optional(),
    images: z.array(imageSchema),
    variants: z.array(variantSchema).min(1),
    tags: z.array(z.string()).optional(),
    vendor: z.string().optional(),
    productType: z.string().optional(),
  })
  .strict();

const collectionSchema = z
  .object({
    id: text,
    handle: z.string().regex(KEBAB),
    title: text,
    description: z.string().optional(),
    image: imageSchema.optional(),
    productCount: z.int().nonnegative(),
  })
  .strict();

// Покупатель — без пароля: схема строгая, лишнее поле `password` она отвергнет (Э2-2 В).
const customerSchema = z.object({ id: text, email: z.email(), name: z.string().optional() }).strict();

// GET /api/store/products — ответ, который читает useProducts.
export const productsReplySchema = z
  .object({ products: z.array(productSchema), total: z.int().nonnegative() })
  .strict();

// GET /api/store/collections — ответ, который читает useCollections.
export const collectionsReplySchema = z
  .object({ collections: z.array(collectionSchema), total: z.int().nonnegative() })
  .strict();

// GET /api/store/auth/me — ответ в обёртке { success, data }, как у входа покупателя в нынешних темах.
export const buyerReplySchema = z
  .object({ success: z.literal(true), data: z.object({ customer: customerSchema }).strict() })
  .strict();
