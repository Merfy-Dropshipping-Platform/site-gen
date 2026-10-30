import { z } from 'zod';

// Что превью сообщает снимку черновика (30.10, шаг 4): какая запись шаблона показана и корзина из товаров магазина.
// Превью кладёт это в страницу JSON-тегом `merfy-look-sample` (`preview-sample.ts`), снимок читает его до отрисовки
// (`look-page.ts`): запись не нашлась — снимок говорит об этом, а не показывает другую молча; корзине подставляются строки.
// Тег — данные, не скрипт: браузер его не выполняет.

export const LOOK_SAMPLE_ID = 'merfy-look-sample';
// Номер корзины в превью: ядро витрины читает его из адреса `?merfy-cart=<uuid>` (`cart-preview.ts` в storefront-shell).
export const SAMPLE_CART_ID = '5a3b1007-0000-4000-8000-000000100c47';
export const SAMPLE_CART_PARAM = 'merfy-cart';
// Сколько товаров магазина попадает в корзину снимка.
export const SAMPLE_CART_LINES = 2;

const lineSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  variantCombinationId: z.string().min(1).nullable(),
  quantity: z.int().min(1),
  unitPriceCents: z.int().min(0),
  name: z.string(),
  imageUrl: z.string().nullable(),
  options: z.record(z.string(), z.string()),
});

const sampleSchema = z.object({
  v: z.literal(1),
  // Запись, которую просили (`record=` у превью): вид, как просили, нашлась ли, название найденной.
  record: z
    .object({ type: z.string(), asked: z.string(), found: z.boolean(), title: z.string().nullable() })
    .optional(),
  // Строки корзины для страниц корзины и оформления; товаров у магазина нет — пустой список.
  cart: z.object({ lines: z.array(lineSchema) }).optional(),
});

export type LookSample = z.infer<typeof sampleSchema>;
export type LookCartLine = z.infer<typeof lineSchema>;

const SAMPLE_TAG = new RegExp(`<script[^>]*\\bid="${LOOK_SAMPLE_ID}"[^>]*>([\\s\\S]*?)</script>`);

// `<` в JSON — знаком \u003c: текст названия товара не закроет тег.
export const sampleTagOf = (sample: LookSample): string =>
  `<script type="application/json" id="${LOOK_SAMPLE_ID}">${JSON.stringify(sample).replaceAll('<', '\\u003c')}</script>`;

export function parseSample(html: string): LookSample | null {
  const raw = SAMPLE_TAG.exec(html)?.[1];
  if (raw === undefined) return null;
  try {
    const parsed = sampleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Ответ шлюза на чтение корзины (`GET /store/carts/:id`) по строкам снимка: тот, что разбирает ядро витрины (`cart-lines.ts`).
export function cartBodyOf(lines: readonly LookCartLine[]): unknown {
  const items = lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    variantCombinationId: line.variantCombinationId,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    totalCents: line.unitPriceCents * line.quantity,
    name: line.name,
    imageUrl: line.imageUrl,
    options: line.options,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    cart: { id: SAMPLE_CART_ID, subtotalCents: subtotal, discountCents: 0, totalCents: subtotal, promoCode: null },
    items,
  };
}
