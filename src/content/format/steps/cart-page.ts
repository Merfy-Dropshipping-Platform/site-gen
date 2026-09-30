/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция содержимого страницы корзины.
 */

import type { Block, PageData } from "./types";
import { getHomeChrome, ensureChrome } from "./shared-chrome";

/**
 * Cart page = Puck-managed ОДНОЙ секцией CartSection (вся ванильная логика корзины:
 * пусто/наполнено/итог/«Оформить»/cart-store). Мерчант может добавлять вокруг другие
 * секции, как на главной. Заменяет прежний 081-layout (CartBody/CartSummary/CartTotals/
 * CartCheckoutButton — был на React-островах, от React отказались).
 * Страница корзины = ДВЕ Puck-секции (spec 110, Figma 1:20818):
 *
 *   • CartBody    («Корзина»)            — пустое состояние + список товаров
 *   • CartSummary («Промежуточный итог») — примечание + «Итого» + «Оформить заказ»
 *
 * У каждой свои «Цветовая схема» и «Отступы», обе видны в дереве конструктора.
 * «Итоговая цена» и «Кнопка оформления заказа» — НЕ отдельные секции страницы, а
 * read-only под-узлы CartSummary (disabledHint-поля cartTotals/cartCheckoutButton,
 * NAMED_SUBSECTIONS.CartSummary в конструкторе), поэтому из content они убираются.
 *
 * ⛔ Почему это вернули (баг-репорт 12 «На странице Корзина отсутствует секция
 * "Промежуточный итог"»). Коммит e861cb47 (28.08) заменил сплит на схлопывание в
 * монолит CartSection, но остальную систему под это НЕ перевёл, и сплит остался
 * заявленным в трёх местах сразу:
 *   - сиды `packages/theme-<t>/pages/cart.json` (все пять тем) кладут CartBody+CartSummary;
 *   - `CART_UNIFIED_THEMES` (page-registry) обещает рендер корзины Puck-блоками;
 *   - конструктор (`componentLabels`, `puckConfigResolver`, NAMED_SUBSECTIONS) адресует
 *     CartBody/CartSummary поимённо;
 *   - `resolveCartDrawerGlobals` берёт схему дровера из CartBody, иначе CartSummary.
 * Миграция же на каждом чтении ревизии стирала оба блока — «Промежуточного итога»
 * не было ни в дереве, ни на витрине, а дровер корзины оставался без схемы мерчанта.
 *
 * Поведение:
 *   - нет page-cart → сид [Header, CartBody, CartSummary, Footer];
 *   - монолит CartSection → разворачивается в CartBody+CartSummary в своей позиции,
 *     схема и отступы мерчанта переносятся (низ монолита уходит на сводку, между
 *     телом и сводкой остаётся 24px — как было внутри монолита);
 *   - легаси-081 (CartTotals/CartCheckoutButton отдельными блоками) → убираются,
 *     их место — под-узлы CartSummary;
 *   - прочие секции (PopularProducts, Collections — кросс-селл мерчанта) сохраняются;
 *   - идемпотентна: [.., CartBody, CartSummary, ..] без монолита — no-op (только chrome).
 */
const LEGACY_CART_SUBBLOCKS = new Set(["CartTotals", "CartCheckoutButton"]);
const CART_PAGE_BLOCKS = new Set([
  "CartSection",
  "CartBody",
  "CartSummary",
  ...LEGACY_CART_SUBBLOCKS,
]);

/** Зазор между «Корзиной» и «Промежуточным итогом» — бывший gap внутри монолита. */
const CART_BODY_BOTTOM_GAP = 24;

function cartPadding(value: unknown): { top: number; bottom: number } | null {
  const p = value as { top?: unknown; bottom?: unknown } | undefined;
  if (!p || typeof p.top !== "number" || typeof p.bottom !== "number")
    return null;
  return { top: p.top, bottom: p.bottom };
}

export function migrateCartPage(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const existing = pagesData["page-cart"] as PageData | undefined;

  const makePair = (source?: Block[]): Block[] => {
    // Настройки берём (в порядке приоритета) у прежних CartBody/CartSummary, затем
    // у монолита — чтобы правки мерчанта пережили разворот.
    const prev = (type: string) =>
      source?.find((b) => b.type === type)?.props as
        | Record<string, unknown>
        | undefined;
    const body = prev("CartBody");
    const summary = prev("CartSummary");
    const mono = prev("CartSection");
    const monoPad = cartPadding(mono?.["padding"]);
    const scheme = body?.["colorScheme"] ?? mono?.["colorScheme"];
    const summaryScheme = summary?.["colorScheme"] ?? scheme;
    return [
      {
        type: "CartBody",
        props: {
          ...(body ?? {}),
          // b45-fix: детерминированный id (не Date.now()) — см. коммент у
          // getHomeChrome. Совпадает с сидом theme.json (`CartBody-1`).
          id: (body?.["id"] as string) ?? "CartBody-1",
          ...(scheme !== undefined ? { colorScheme: scheme } : {}),
          padding:
            cartPadding(body?.["padding"]) ??
            (monoPad
              ? { top: monoPad.top, bottom: CART_BODY_BOTTOM_GAP }
              : { top: 80, bottom: CART_BODY_BOTTOM_GAP }),
        },
      },
      {
        type: "CartSummary",
        props: {
          ...(summary ?? {}),
          id: (summary?.["id"] as string) ?? "CartSummary-1",
          ...(summaryScheme !== undefined
            ? { colorScheme: summaryScheme }
            : {}),
          padding:
            cartPadding(summary?.["padding"]) ??
            (monoPad
              ? { top: 0, bottom: monoPad.bottom }
              : { top: 0, bottom: 80 }),
        },
      },
    ];
  };

  // Нет page-cart → полный сид [Header, CartBody, CartSummary, Footer].
  if (!existing || !Array.isArray(existing.content)) {
    const chrome = getHomeChrome(pagesData);
    return {
      ...pagesData,
      "page-cart": {
        content: [chrome.headerBlock, ...makePair(), chrome.footerBlock],
        root: { props: { title: "Корзина" } },
        zones: {},
      } as PageData,
    };
  }

  const content = existing.content.filter(
    (b): b is Block => !!b && typeof b?.type === "string",
  );
  const types = content.map((b) => b.type ?? "");
  const isCanonical =
    types.filter((t) => t === "CartBody").length === 1 &&
    types.filter((t) => t === "CartSummary").length === 1 &&
    types.indexOf("CartBody") + 1 === types.indexOf("CartSummary") &&
    !types.includes("CartSection") &&
    !types.some((t) => LEGACY_CART_SUBBLOCKS.has(t));

  if (isCanonical) {
    const patched = ensureChrome(content, pagesData);
    if (
      patched.length === content.length &&
      patched.every((b, i) => b === content[i])
    ) {
      return pagesData;
    }
    return { ...pagesData, "page-cart": { ...existing, content: patched } };
  }

  // Разворот: все cart-блоки страницы (монолит и/или легаси-081) → одна пара
  // CartBody+CartSummary в позиции ПЕРВОГО из них. Прочее остаётся как есть.
  const firstCartIdx = content.findIndex((b) =>
    CART_PAGE_BLOCKS.has(b.type ?? ""),
  );
  const cartBlocks = content.filter((b) => CART_PAGE_BLOCKS.has(b.type ?? ""));
  const kept = content.filter((b) => !CART_PAGE_BLOCKS.has(b.type ?? ""));
  const keptBefore =
    firstCartIdx >= 0
      ? content
          .slice(0, firstCartIdx)
          .filter((b) => !CART_PAGE_BLOCKS.has(b.type ?? "")).length
      : (() => {
          const fi = kept.findIndex((b) => b.type === "Footer");
          return fi >= 0 ? fi : kept.length;
        })();
  const next = [
    ...kept.slice(0, keptBefore),
    ...makePair(cartBlocks),
    ...kept.slice(keptBefore),
  ];
  const withChrome = ensureChrome(next, pagesData);
  return { ...pagesData, "page-cart": { ...existing, content: withChrome } };
}
