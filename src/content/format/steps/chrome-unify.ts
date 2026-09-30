/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Унификация шапки/подвала со страницей `home` (последний шаг миграции).
 */

import type { Block, PageData } from './types';

/**
 * Шапка на ВСЕХ страницах = шапка ГЛАВНОЙ (пункт 13 тестировщика: «на всех
 * страницах блок Шапка совпадает и остаётся таким же, как например на главной»).
 *
 * Почему это нужно как отдельный проход, а не «поправить сид»: блок `Header`
 * хранится КОПИЕЙ в `pagesData[<страница>].content`, и источников копии четыре —
 * сиды тем (`packages/theme-<t>/pages/<id>.json`), `ensureChrome` и
 * `migrateContentPages`, фолбэк конструктора и lazy-seed резолвера. Пока у
 * каждой копии своя судьба, расхождение неизбежно. Этот проход делает главную единственным источником
 * правды на ЧИТАЮЩЕМ пути (getRevision → сайдбар конструктора, preview, build),
 * поэтому все четыре источника сходятся в одну шапку.
 *
 * Правила:
 *  - props берутся с главной ЦЕЛИКОМ (replace, не merge) → набор параметров на
 *    странице не может быть ни шире, ни уже, чем на главной;
 *  - собственный `id` блока сохраняется — Puck ломается на дубликатах id;
 *  - `CheckoutHeader` не трогается: это ДРУГОЙ компонент (минимальная шапка
 *    чекаута по Figma 1:13563), у него свой набор полей by design;
 *  - если шапка главной вырождена (только `id`) — проход выключается целиком.
 *    Такой шапки не бывает у живого мерчанта: это артефакт старого сида
 *    (`pages/about.json` = `Header{id}`) и дрейфа `syncSharedSections`.
 *    Раскатать её значит стереть логотип и название магазина на всех
 *    остальных страницах (наблюдалось на demo-rose 71f9b323…).
 *
 * Идемпотентна: повторный прогон даёт тот же объект (порядок ключей фиксирован
 * `{...canon, id}`), неизменённые страницы возвращаются по прежней ссылке.
 */
function blockHasSettings(block: Block | undefined): boolean {
  if (!block) return false;
  return Object.keys(block.props ?? {}).some((k) => k !== 'id');
}

function samePropsShallow(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown>,
): boolean {
  const ak = Object.keys(a ?? {});
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return bk.every(
    (k) => JSON.stringify((a ?? {})[k] ?? null) === JSON.stringify(b[k] ?? null),
  );
}

/**
 * Группа «Шапка» в левой колонке конструктора = промо-баннер + шапка. Третий
 * круг тестировщика: «на всех страницах блок Шапка отличается, как набором
 * СЕКЦИЙ и параметров». Параметры прошлый проход уже выровнял, а набор секций —
 * нет: у rose промо-баннер лежал на 5 страницах из 11, у flux и bloom — только
 * на главной, и мерчант видел в сайдбаре то две строки, то одну.
 *
 * Порядок внутри массива — как на главной (промо НАД шапкой).
 */
const HEADER_GROUP_TYPES = ['PromoBanner', 'Header'] as const;

const isHeaderGroup = (type: unknown): boolean =>
  (HEADER_GROUP_TYPES as readonly string[]).includes(String(type));

export function unifyHeaderWithHome(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const home = pagesData['home'] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content) ? (home!.content as Block[]) : [];
  const source = homeContent.find((b) => b?.type === 'Header');
  if (!blockHasSettings(source)) return pagesData;

  // Эталонная группа: блоки группы «Шапка» в порядке главной.
  const homeGroup = homeContent.filter((b) => isHeaderGroup(b?.type));

  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, page] of Object.entries(pagesData)) {
    if (pageId === 'home') continue;
    // Служебные ключи pagesData (напр. `_vanillaHomeMigrationVersion`: number)
    // НЕ страницы — пропускаем, сохраняя значение как есть.
    const content = (page as PageData | undefined)?.content;
    if (!Array.isArray(content)) continue;
    // Страница со своим хромом (чекаут: `CheckoutHeader`) — другой компонент
    // by design, группу главной туда не переносим.
    if (!content.some((b) => b?.type === 'Header')) continue;

    // id блока держим ЗА СТРАНИЦЕЙ: Puck ломается на дубликатах, а превью и
    // конструктор ищут секцию по `props.id`. Был свой блок такого типа —
    // сохраняем его id; не было — детерминированный `<Тип>-<страница>`
    // (идемпотентность: повторный прогон даёт тот же id).
    const ownIds = new Map<string, unknown>();
    for (const b of content) {
      if (isHeaderGroup(b?.type) && b?.props?.id !== undefined) {
        if (!ownIds.has(String(b.type))) ownIds.set(String(b.type), b.props.id);
      }
    }
    const rest = content.filter((b) => !isHeaderGroup(b?.type));
    const group = homeGroup.map((b) => {
      const props: Record<string, unknown> = { ...(b.props ?? {}) };
      const ownId = ownIds.get(String(b.type));
      props.id = ownId !== undefined ? ownId : `${String(b.type)}-${pageId}`;
      return { ...b, props };
    });
    const next = [...group, ...rest];

    if (!sameContentShallow(content, next)) {
      out[pageId] = { ...(page as PageData), content: next };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/** Поблочное сравнение: тип + props (для идемпотентности прохода). */
function sameContentShallow(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (blk, i) =>
      blk?.type === b[i]?.type && samePropsShallow(blk?.props, b[i]?.props ?? {}),
  );
}

/**
 * «Спасибо за заказ» — обычная страница магазина: шапка и подвал главной, как
 * на «О нас» (владелец 26.09: «обычную шапку, шрифты и цветовые схемы брать из
 * настройки темы»). Витрина так и рисовала (реестр страниц: `chrome: 'full'`),
 * а в ревизии страницы лежала «Шапка оформления» без подвала — конструктор
 * показывал её и расходился с витриной.
 *
 * «Шапку оформления» заменяем группой «Шапка» главной, подвал главной
 * добавляем в конец, если его нет. id блоков — детерминированные
 * `<Тип>-<страница>` (идемпотентно). Дальше страницу держат в синхроне
 * общие unifyHeaderWithHome / unifyFooterWithHome.
 */
const CHECKOUT_RESULT_PAGE_IDS = ['page-checkout-result', 'checkout-result'] as const;

export function storeChromeOnCheckoutResult(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const homeContent = (pagesData['home'] as PageData | undefined)?.content;
  const home: Block[] = Array.isArray(homeContent) ? (homeContent as Block[]) : [];
  const headerGroup = home.filter((b) => isHeaderGroup(b?.type));
  const footer = home.find((b) => b?.type === 'Footer');
  if (!headerGroup.some((b) => b?.type === 'Header')) return pagesData;

  const copyFor = (pageId: string) => (b: Block): Block => ({
    ...b,
    props: { ...(b.props ?? {}), id: `${String(b.type)}-${pageId}` },
  });

  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of CHECKOUT_RESULT_PAGE_IDS) {
    const page = pagesData[pageId] as PageData | undefined;
    const content = Array.isArray(page?.content) ? (page!.content as Block[]) : null;
    if (!content) continue;
    const ownHeader = content.filter((b) => isHeaderGroup(b?.type));
    const ownFooter = content.filter((b) => b?.type === 'Footer');
    const body = content.filter(
      (b) => b?.type !== 'CheckoutHeader' && b?.type !== 'Footer' && !isHeaderGroup(b?.type),
    );
    const next = [
      ...(ownHeader.some((b) => b?.type === 'Header') ? ownHeader : headerGroup.map(copyFor(pageId))),
      ...body,
      ...(ownFooter.length > 0 ? ownFooter : footer ? [copyFor(pageId)(footer)] : []),
    ];
    if (sameContentShallow(content, next)) continue;
    out[pageId] = { ...(page as PageData), content: next };
    changed = true;
  }
  return changed ? out : pagesData;
}

/**
 * Подвал на ВСЕХ страницах = подвал ГЛАВНОЙ. Пункт 3б сближения «витрина =
 * конструктор»: владелец 23.09 выбрал общий хром, как в Shopify. Зеркало
 * {@link unifyHeaderWithHome} для подвала.
 *
 * Зачем. Витрина уже рисует на внутренних страницах подвал главной
 * (`applyChromeToDist`), а превью конструктора — копию блока со страницы. У «О
 * нас», «Доставки», «Контактов», досеянных из пакета темы, эта копия — подвал
 * темы по умолчанию (замер 23.09: превью этих страниц ≠ главной на всех пяти
 * QA-сайтах и у стендов flux/bloom/rose), а у сохранённых страниц — старая
 * копия. Панель конструктора при этом показывает подвал главной: превью
 * расходилось и с панелью, и с витриной.
 *
 * Правила те же, что у шапки: props главной целиком, собственный `id` блока
 * сохраняется, вырожденный подвал главной (только `id`) не раскатывается.
 * Состав страниц не меняется: подвал заменяется только там, где он уже есть.
 */
export function unifyFooterWithHome(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  const homeContent = (pagesData['home'] as PageData | undefined)?.content;
  const source = Array.isArray(homeContent)
    ? homeContent.find((b) => b?.type === 'Footer')
    : undefined;
  if (!source || !blockHasSettings(source)) return pagesData;
  const canon = source.props ?? {};

  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, page] of Object.entries(pagesData)) {
    if (pageId === 'home') continue;
    const content = (page as PageData | undefined)?.content;
    if (!Array.isArray(content)) continue;
    const withHomeFooter = (b: Block): Block =>
      b?.type === 'Footer'
        ? { ...b, props: { ...canon, id: b.props?.id ?? `Footer-${pageId}` } }
        : b;
    const next = content.map(withHomeFooter);
    if (sameContentShallow(content, next)) continue;
    out[pageId] = { ...(page as PageData), content: next };
    changed = true;
  }
  return changed ? out : pagesData;
}
