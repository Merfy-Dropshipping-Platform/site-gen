/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция и сидер страницы чекаута + thank-you (`/checkout-result`).
 */

import type { Block, PageData } from "./types";
import { getHomeChrome } from "./shared-chrome";
import { getThemeManifest } from "../../../themes/theme-manifest-loader";

/**
 * Figma 1:19998: checkout page = 4 sections (Header / CheckoutForm /
 * CheckoutSummary / Footer). 6 form-side blocks (Contact/Delivery/Method/
 * Payment/Submit/Terms) консолидированы в CheckoutForm; OrderSummary + Totals
 * — в CheckoutSummary.
 *
 *   - Seeds Figma-canonical 4-block layout когда checkout missing.
 *   - Migrates legacy 11-block sites (080) → 4-block (collapse inner blocks
 *     in form/summary mega).
 *   - Idempotent: уже-мигрированные на 2-mega остаются.
 *   - Legacy `siteConfig.checkout` НЕ мигрируется — merchant settings
 *     теперь hardcoded в CheckoutForm.astro defaults.
 */
/**
 * Легаси-блоки чекаута 080: контейнер + fine-grained части, которые с Figma
 * 1:19998 схлопнуты в CheckoutForm/CheckoutSummary. В дереве конструктора они
 * не нужны — подписи несут «(устар.)», а панели предлагают чужие настройки.
 */
const LEGACY_CHECKOUT_TYPES: ReadonlySet<string> = new Set<string>([
  "CheckoutLayout",
  "CheckoutSummaryToggle",
  "CheckoutContactForm",
  "CheckoutDeliveryForm",
  "CheckoutDeliveryMethod",
  "CheckoutPayment",
  "CheckoutOrderSummary",
  "CheckoutTotals",
  "CheckoutSubmit",
  "CheckoutTerms",
]);

/**
 * b35 (16.09, локальный стенд): «Цветовая схема» чекаута (CheckoutForm /
 * CheckoutSummary) сидировалась платформенной константой `'scheme-2'`,
 * которая молча предполагала, что вторая схема темы всегда светлая. Неверно —
 * у vanilla заводская Схема 2 тёмно-оливковая (`58 69 48`), у bloom розовая
 * (`227 142 159`); мерчант открывал чекаут (и превью, и витрину — оба пути
 * стампуют класс из ОДНОГО этого значения, см. `chrome-assembler.
 * patchCheckoutColumnScheme`) и видел его перекрашенным в акцент темы.
 *
 * `scheme-checkout` — своя, НЕЧИСЛОВАЯ «схема»: не входит в редактируемый
 * мерчантом список 1..5, поэтому не путается с реальным выбором, и её CSS
 * (`CHECKOUT_SCHEME_CSS`, `src/themes/tokens-css.ts`) фиксированно светлый —
 * не зависит от темы (Figma 1:13398 — чекаут всегда светлый). Кнопка/акцент
 * не переопределяются в этом правиле — наследуются от `:root`, то есть от
 * схемы магазина по умолчанию.
 *
 * Зеркало (держать байт-в-байт синхронно при переименовании):
 * `CHECKOUT_SCHEME_ID` в `src/themes/tokens-css.ts` — `scheme-checkout` минус
 * префикс `scheme-` (снимает `schemeIdOf`/`schemeIdFromProp`) даёт ровно её.
 */
const CHECKOUT_SCHEME_PROP = "scheme-checkout";

/** Прежнее сидовое значение — только ЕГО retag красит в новую схему (осознанный выбор мерчанта не трогаем, тот же приём что `dropSeededCartScheme`). */
const CHECKOUT_SEED_SCHEME = "scheme-2";
const CHECKOUT_BLOCK_TYPES = new Set(["CheckoutForm", "CheckoutSummary"]);

/**
 * Ретроактивный аналог `dropSeededCartScheme`, но для чекаута: существующие
 * ревизии, засеянные до b35 литералом `'scheme-2'` на CheckoutForm/
 * CheckoutSummary, переводим на `CHECKOUT_SCHEME_PROP`. В отличие от корзины —
 * БЕЗ гейта по теме: чекаут не «принадлежит теме» (см. коммент у
 * `dropSeededCartScheme`), Figma 1:13398 требует светлый чекаут на ВСЕХ пяти
 * темах одинаково, поэтому замена применяется универсально.
 *
 * Снимается ТОЛЬКО точное `'scheme-2'` (значение сида) — если мерчант явно
 * выбрал в панели именно Схему 2, значение неотличимо от сида и тоже
 * переедет; это тот же принятый компромисс, что и в `dropSeededCartScheme`.
 */
export function retagSeededCheckoutScheme(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const page =
    (pagesData["page-checkout"] as PageData | undefined) ??
    (pagesData["checkout"] as PageData | undefined);
  if (!page || !Array.isArray(page.content)) return pagesData;
  let changed = false;
  const content = page.content.map((block) => {
    const b = block as { type?: string; props?: Record<string, unknown> };
    if (!b?.type || !CHECKOUT_BLOCK_TYPES.has(b.type) || !b.props) return block;
    if (b.props.colorScheme !== CHECKOUT_SEED_SCHEME) return block;
    changed = true;
    return { ...b, props: { ...b.props, colorScheme: CHECKOUT_SCHEME_PROP } };
  });
  if (!changed) return pagesData;
  const patchedPage = { ...(page as object), content };
  return { ...pagesData, "page-checkout": patchedPage, checkout: patchedPage };
}

export function migrateCheckoutPage(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  // Constructor uses `page-checkout` key, live `pages/checkout.astro` reads
  // `checkout`. Keep BOTH keys in sync (migrate either source → both).
  //
  // БАГ-РЕПОРТ ВЛАДЕЛЬЦА (18.09): «Сводка и оформление заказа — не
  // применяется цветовая схема Rose». Живой замер (customize.merfy.ru, Rose,
  // siteId 53e9152f…): конструктор шлёт `POST /revisions` с обновлённым
  // `pagesData['page-checkout']` (CheckoutForm.colorScheme = "scheme-4"), но
  // держит соседний дубликат `pagesData['checkout']` НЕ синхронизированным —
  // тот остаётся на прежнем "scheme-checkout". Эта функция раньше отдавала
  // приоритет ИМЕННО `checkout` (`fromNew`), когда у него есть контент —
  // и на КАЖДОЙ следующей загрузке (превью, живая сборка — обе идут через
  // `migrateRevisionData`) переписывала свежий `page-checkout` СТАРЫМ
  // содержимым `checkout`, стирая выбор мерчанта молча (без ошибок, без
  // расхождения путей превью/витрина — обе читают одну и ту же испорченную
  // ревизию). Источник истины — `page-checkout` (см. комментарий выше:
  // «Constructor uses page-checkout key»); `checkout` — производный дубликат
  // для legacy-рендера темы, не должен затирать актуальные правки.
  const out: Record<string, unknown> = { ...pagesData };
  const fromLegacy = out["page-checkout"] as PageData | undefined;
  const fromNew = out["checkout"] as PageData | undefined;
  const source = fromLegacy?.content?.length ? fromLegacy : fromNew;

  // Уже консолидирован в 2 mega-блока (новый Figma 1:19998 layout) — no-op.
  if (
    source &&
    Array.isArray(source.content) &&
    source.content.some((b) => b?.type === "CheckoutForm")
  ) {
    let chromed: PageData = source;
    // ГИБРИДНОЕ состояние: страница уже несёт CheckoutForm/CheckoutSummary, но
    // рядом остался легаси-контейнер 080 (CheckoutLayout и fine-grained блоки).
    // Раньше эта ветка выходила первой и оставляла их в дереве — мерчант видел
    // «Чекаут (контейнер, устар.)» и его панель вместо настроек оформления.
    // Функциональность не теряется: CheckoutForm рендерит те же части внутри.
    if (
      chromed.content!.some((b) => b?.type && LEGACY_CHECKOUT_TYPES.has(b.type))
    ) {
      chromed = {
        ...chromed,
        content: chromed.content!.filter(
          (b) => !(b?.type && LEGACY_CHECKOUT_TYPES.has(b.type)),
        ),
      };
    }
    if (!chromed.content!.some((b) => b?.type === "Footer")) {
      const { footerBlock } = getHomeChrome(pagesData);
      chromed = {
        ...chromed,
        content: [...(chromed.content ?? []), footerBlock],
      };
    }
    out["checkout"] = chromed;
    out["page-checkout"] = chromed;
    return out;
  }

  // Legacy 080: имеет CheckoutLayout + 11 fine-grained блоков. Collapse в
  // [CheckoutHeader, CheckoutForm, CheckoutSummary, Footer]. Удаляем
  // 11 inner blocks (functionality сохраняется т.к. CheckoutForm рендерит
  // их через Astro imports с теми же дефолтами).
  if (
    source &&
    Array.isArray(source.content) &&
    source.content.some((b) => b?.type === "CheckoutLayout")
  ) {
    // b45-fix: детерминированные id (не Date.now()) — см. коммент у
    // getHomeChrome. Совпадает с сидом theme.json (`CheckoutHeader-1` и т.д.).
    const header = source.content.find((b) => b?.type === "CheckoutHeader");
    const footer = source.content.find((b) => b?.type === "Footer");
    const collapsed: Block[] = [
      header ?? {
        type: "CheckoutHeader",
        props: {
          id: "CheckoutHeader-1",
          siteTitle: "Мой магазин",
          logoMode: "text",
          logoImage: null,
          rightIcon: "cart",
          accountLink: "/account",
          backLink: "/cart",
          cartLink: "/cart",
          padding: { top: 24, bottom: 24 },
        },
      },
      {
        type: "CheckoutForm",
        // b35: НЕ 'scheme-2' — платформенная константа молча считала вторую
        // схему темы светлой (у vanilla она тёмно-оливковая, у bloom —
        // розовая). `scheme-checkout` — отдельная, нечисловая схема с
        // фиксированными светлыми токенами (Figma 1:13398), см.
        // `CHECKOUT_SCHEME_CSS` в `tokens-css.ts`.
        props: {
          id: "CheckoutForm-1",
          colorScheme: CHECKOUT_SCHEME_PROP,
          padding: { top: 0, bottom: 0 },
        },
      },
      {
        type: "CheckoutSummary",
        props: {
          id: "CheckoutSummary-1",
          colorScheme: CHECKOUT_SCHEME_PROP,
          padding: { top: 0, bottom: 0 },
        },
      },
      footer ?? getHomeChrome(pagesData).footerBlock,
    ];
    const chromed: PageData = { ...source, content: collapsed };
    out["checkout"] = chromed;
    out["page-checkout"] = chromed;
    return out;
  }
  // Figma 1:19998 — 2 mega-блока «Оформление заказа» + «Сводка заказа».
  // Inner config (Contact / Delivery / Payment fields, terms text, etc) —
  // hardcoded в CheckoutForm.astro / CheckoutSummary.astro defaults.
  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`CheckoutHeader-1` и т.д.).
  const seedBlocks: Block[] = [
    {
      type: "CheckoutHeader",
      props: {
        id: "CheckoutHeader-1",
        siteTitle: "Мой магазин",
        logoMode: "text",
        logoImage: null,
        rightIcon: "cart",
        accountLink: "/account",
        backLink: "/cart",
        cartLink: "/cart",
        padding: { top: 24, bottom: 24 },
      } as Record<string, unknown>,
    },
    {
      type: "CheckoutForm",
      props: {
        id: "CheckoutForm-1",
        // b35: НЕ 'scheme-2' — см. `retagSeededCheckoutScheme` ниже.
        colorScheme: CHECKOUT_SCHEME_PROP,
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
    {
      type: "CheckoutSummary",
      props: {
        id: "CheckoutSummary-1",
        colorScheme: CHECKOUT_SCHEME_PROP,
        padding: { top: 0, bottom: 0 },
      } as Record<string, unknown>,
    },
  ];

  // 094: append Footer at end (CheckoutHeader stays as the checkout-specific
  // header variant; no global Header on checkout).
  const { footerBlock } = getHomeChrome(pagesData);
  const newPage: PageData = {
    content: [...seedBlocks, footerBlock],
    root: { props: { title: "Оформление заказа" } },
    zones: {},
  };
  return {
    ...out,
    checkout: newPage,
    "page-checkout": newPage,
  };
}

/**
 * Данные пакета решают, знает ли тема страницу `/checkout-result` — читаем
 * `theme.json.pages`, а не сравниваем `themeId` со списком имён. Манифест
 * типизирован без поля `pages` (`ThemeManifest` в theme-manifest-loader.ts
 * покрывает только то, что читает он сам) — тот же приём локального
 * каста, что уже используют `sites.service.ts#buildInitialRevision` и
 * `page-blocks.ts`.
 */
export function themeHasCheckoutResultPage(
  themeId: string | null | undefined,
): boolean {
  if (!themeId) return false;
  const manifest = getThemeManifest(themeId) as {
    pages?: Array<{ id?: string }>;
  } | null;
  return (manifest?.pages ?? []).some((p) => p?.id === "page-checkout-result");
}

/**
 * Spec 103/109: thank-you страница `/checkout-result` (CheckoutHeader +
 * OrderConfirmation «Спасибо за заказ»). Системная страница добавлена в
 * `theme.json` тем, у кого она есть, ПОСЛЕ того как существующие сайты
 * достигли ревизии 2.0, поэтому version-миграции её не бэкфилят. Аддитивно
 * добавляем в pages[] + pagesData (идемпотентно). Оперирует полной ревизией
 * (нужен pages[]), а не только pagesData.
 *
 * Вызывающая сторона (`migrateRevisionData`) решает, звать ли эту функцию,
 * по МАНИФЕСТУ темы (`theme.json.pages` содержит `page-checkout-result`?),
 * а не по имени темы — состав страниц темы это данные пакета, не код. Сейчас
 * страница есть у всех пяти тем (vanilla — с 26.09: без неё после оплаты
 * покупатель попадал на пустоту или на страницу прошлой темы магазина).
 */
export function seedCheckoutResultPage(
  out: Record<string, unknown>,
): Record<string, unknown> {
  const pagesData = (out.pagesData ?? {}) as Record<string, unknown>;
  const pages = Array.isArray(out.pages)
    ? (out.pages as Array<{ id?: string; slug?: string }>)
    : [];
  const hasContent =
    !!pagesData["page-checkout-result"] || !!pagesData["checkout-result"];
  const hasMeta = pages.some(
    (p) =>
      p?.id === "page-checkout-result" ||
      (p?.slug ?? "").replace(/^\/+|\/+$/g, "") === "checkout-result",
  );
  if (hasContent && hasMeta) return out; // already present — no-op (idempotent)

  // b45-fix: детерминированные id (не Date.now()) — см. коммент у
  // getHomeChrome. Совпадает с сидом theme.json (`CheckoutHeader-1` и т.д.).
  // Только тело страницы: шапку и подвал магазина кладёт
  // storeChromeOnCheckoutResult (они берутся с главной). Схему не задаём —
  // прежняя константа `scheme-2` у bloom/vanilla означала цветную акцентную
  // схему, а не «светлую» (тот же класс ошибки, что b35 на чекауте).
  const seedPage: PageData = {
    content: [
      {
        type: "OrderConfirmation",
        props: {
          id: "OrderConfirmation-1",
          padding: { top: 0, bottom: 0 },
        } as Record<string, unknown>,
      },
    ],
    root: { props: { title: "Спасибо за заказ" } },
    zones: {},
  };

  const newPagesData = hasContent
    ? pagesData
    : { ...pagesData, "page-checkout-result": seedPage };
  const newPages = hasMeta
    ? pages
    : [
        ...pages,
        {
          id: "page-checkout-result",
          name: "Спасибо за заказ",
          slug: "/checkout-result",
          role: "system",
          contentFile: "pages/checkout-result.json",
        },
      ];
  return { ...out, pages: newPages, pagesData: newPagesData };
}
