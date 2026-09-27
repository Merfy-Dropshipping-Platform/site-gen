/**
 * Подарок акции «1+1=3» — одной позицией с купленным товаром, только для показа.
 *
 * Владелец 27.09 (вариант А): «×3, одна в подарок», цена — за две. В корзине
 * сервера и в заказе подарок лежит отдельной строкой (`isBonus`, 0 ₽,
 * `bonusSourceLineId` → строка, с которой он скопирован): так его резервирует
 * склад, так он идёт в чек. Модель не трогаем — склеиваем при показе:
 * к строке прибавляется количество подарка, `giftQuantity` говорит, сколько
 * из штук подарено. `totalCents` строки остаётся суммой за оплаченные штуки.
 *
 * Подарок находит «свою» строку по `bonusSourceLineId`, иначе — по тому же
 * товару и варианту. Подарок без пары остаётся отдельной строкой.
 *
 * Та же склейка в письме о заказе (orders `src/orders/gift-lines.ts`) и в
 * карточке заказа кабинета продавца (Platform `giftLines.ts`).
 *
 * Функция — самодостаточная и без синтаксиса новее ES2015: встроенные скрипты
 * блоков получают её строкой (`GIFT_LINES_SOURCE`, `.toString()` той же
 * функции — второй копии нет).
 */

export interface GiftLine {
  id?: unknown;
  productId?: unknown;
  variantCombinationId?: unknown;
  quantity?: unknown;
  isBonus?: unknown;
  bonusSourceLineId?: unknown;
  giftQuantity?: number;
  [key: string]: unknown;
}

export function mergeGiftLines(items: unknown): GiftLine[] {
  var list = (Array.isArray(items) ? items : []) as GiftLine[];
  var qtyOf = function (line: GiftLine) { return Number(line.quantity) || 1; };
  var sameGoods = function (a: GiftLine, b: GiftLine) {
    return a.productId === b.productId && (a.variantCombinationId || null) === (b.variantCombinationId || null);
  };
  var shown: GiftLine[] = list
    .filter(function (line) { return line && !line.isBonus; })
    .map(function (line) { return Object.assign({}, line, { quantity: qtyOf(line), giftQuantity: 0 }); });
  var ownerOf = function (gift: GiftLine) {
    var byLink = shown.filter(function (s) { return s.id != null && s.id === gift.bonusSourceLineId; })[0];
    return byLink || shown.filter(function (s) { return sameGoods(s, gift); })[0];
  };
  var loose: GiftLine[] = [];
  list.filter(function (line) { return line && line.isBonus; }).forEach(function (gift) {
    var owner = ownerOf(gift);
    if (!owner) {
      loose.push(Object.assign({}, gift, { quantity: qtyOf(gift), giftQuantity: qtyOf(gift) }));
      return;
    }
    owner.quantity = (owner.quantity as number) + qtyOf(gift);
    owner.giftQuantity = (owner.giftQuantity as number) + qtyOf(gift);
  });
  return shown.concat(loose);
}

/** Строка для `<script is:inline set:html={…}>`: `window.__merfyMergeGiftLines`. */
export const GIFT_LINES_SOURCE = `
${mergeGiftLines.toString()}
if (typeof window !== 'undefined') { window.__merfyMergeGiftLines = mergeGiftLines; }
`.trim();
