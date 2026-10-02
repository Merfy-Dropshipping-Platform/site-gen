/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * «Мультиряды» (Высота секции/ряда) и «Галерея» (канон плиток).
 */

import type { Block, PageData } from "./types";

/**
 * Мультиряды: перенести «Как в секции» в тот размер, который ряд и так рисовал.
 *
 * Решение владельца 2026-09-13: «Убрать из пункта Размер сектор „Как в секции"
 * во всех темах. Придавать размеры заголовку как везде». Опция снята из панели
 * (`MultiRows.puckConfig.ts`), и сохранённое `size: 'inherit'` осталось бы
 * значением, которого в списке нет: селект показал бы пустоту, а
 * `CustomFieldsPanel.updateProp` домержил бы дефолт при правке СОСЕДНЕГО поля
 * и молча сменил размер ряда на витрине.
 *
 * Переносим в тот же размер, что рисует порт, — иначе у мерчанта изменится вид.
 * `MultiRows.astro` берёт `aspectKey(row.size, sectionSize)`, где
 * `sectionSize = props.size === 'small' || 'large' ? props.size : 'medium'`.
 * Проверено реальным рендером rose (dist/theme-sections): секция small/medium/
 * large + ряд «Как в секции» дают ровно ту же разметку, что ряд small/medium/
 * large; секция без размера — medium.
 *
 * Ряд БЕЗ значения не трогаем: отсутствие — законное состояние, порт сам возьмёт
 * секционный фолбэк, а дописывание материализовало бы в данные невыбранное.
 *
 * Здесь была ОБРАТНАЯ миграция: она переписывала сохранённый одинаковый `small`
 * в «Как в секции», чтобы оживить общую «Высоту» секции. После решения
 * владельца она заводила бы в данные снятое значение, поэтому убрана.
 *
 * Идемпотентна: после прогона снятого значения в данных не остаётся.
 */

/** Фолбэк ряда = «высота» секции ровно по правилу MultiRows.astro. */
function multiRowsSectionSize(props: Record<string, unknown>): string {
  const raw = props.size;
  return raw === "small" || raw === "large" ? raw : "medium";
}

/**
 * Секция «Мультиряды» без собственной «Высоты» получает 'medium' — ровно тот
 * вид, который у неё был, пока высотой правили ряды.
 *
 * Зачем. 19.09 секционная «Высота» ожила, и фолбэк порта пришлось свести с
 * дефолтом панели
 * ('small' у rose/bloom/flux/vanilla, 'medium' у satin со своим puckConfig) —
 * иначе рендер «с дефолтом» расходился с рендером «без значения», что и ловит
 * `panel-default-is-noop`. Но у части живых ревизий секционного `size` НЕТ
 * вовсе: нормализация `adaptLegacyProps` его не подставляет, а до 19.09
 * отсутствие читалось как СРЕДНИЙ аспект (rose 429/444, bloom 652/594, flux и
 * satin square, vanilla 652/366 — проверено по всем пяти портам). Со сведённым
 * фолбэком такие секции стали бы ниже — вид живых магазинов поехал бы без
 * просьбы владельца.
 *
 * ПОПРАВКА 20.09. Эвристика `perRowSizesDiffer`, которой тогда оживили
 * «Высоту», снята: она отменяла выбранный размер ряда, стоило мерчанту довести
 * его до всех рядов. Секция снова лишь ФОЛБЭК для ряда без своего размера, а
 * «Высоту» конструктор прописывает во все ряды при изменении. На эту миграцию
 * это не влияет: она по-прежнему делает прежний молчаливый фолбэк явным
 * значением и по-прежнему ничего не меняет на экране.
 *
 * Поэтому отсутствие материализуем в 'medium': во ВСЕХ пяти портах
 * `aspectFor('medium')` попадает в ту же ветку, что и `aspectFor(undefined)`,
 * то есть миграция ничего не меняет на экране — она лишь делает прежний
 * молчаливый фолбэк явным значением. Секции с заданной «Высотой» не трогаем.
 */
export function materializeMultiRowsSectionSize(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    if (!page || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = page.content.map((block) => {
      const b = block as { type?: string; props?: Record<string, unknown> };
      if (b?.type !== "MultiRows" || !b.props) return block;
      const raw = b.props.size;
      if (raw === "small" || raw === "medium" || raw === "large") return block;
      pageChanged = true;
      return { ...b, props: { ...b.props, size: "medium" } };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

export function materializeMultiRowsItemSize(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    if (!page || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = page.content.map((block) => {
      const b = block as { type?: string; props?: Record<string, unknown> };
      if (b?.type !== "MultiRows" || !b.props) return block;
      const rows = b.props.rows;
      if (!Array.isArray(rows) || rows.length === 0) return block;
      const stale = (r: unknown) =>
        !!r &&
        typeof r === "object" &&
        (r as { size?: unknown }).size === "inherit";
      if (!rows.some(stale)) return block;
      const fallback = multiRowsSectionSize(b.props);
      const nextRows = rows.map((r) =>
        stale(r) ? { ...(r as Record<string, unknown>), size: fallback } : r,
      );
      pageChanged = true;
      return { ...b, props: { ...b.props, rows: nextRows } };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}

/**
 * Канон галереи = `Gallery.defaultProps.items` из puck-config, который получает
 * конструктор. Литерал, а не импорт `GalleryPuckConfig`: файл блока лежит в
 * `packages/` и тянет за собой zod-схему (и её незакрытый тип `defaults` без
 * `padding` — `padding` там снят намеренно, чтобы не плющить ритм пяти тем).
 * Совпадение сторожит гард `fresh-site-sections.spec.ts`: он сверяет этот
 * массив с живым `GET /api/themes/:id/puck-config` по всем пяти темам.
 */
export const GALLERY_CANON_ITEMS: ReadonlyArray<Record<string, unknown>> = [
  { id: "item-1", type: "image", url: "", alt: "Изображение" },
  { id: "item-2", type: "product", productId: null },
  { id: "item-3", type: "collection", collectionId: null },
];

/**
 * Галерея: нетронутая секция обязана нести свои три плитки в данных.
 *
 * Баг владельца (2026-09-14): «При создании магазина секция галерея не
 * отображается, требуется выполнить любое действие с секцией и тогда все
 * работает штатно».
 *
 * Механизм (замер 2026-09-14). Порты всех пяти тем рисуют галерею СТРОГО по
 * `props.items` — пустой массив даёт секцию с одним заголовком и больше ничем
 * (видимый текст rose = "Галерея", ноль <img>). У соседей по
 * `clearDemoImageSections` пустое состояние — это ВЕТКА РЕНДЕРА (Hero,
 * ImageWithText, Slideshow, MultiColumns рисуют свой плейсхолдер и без пропов),
 * а у галереи — ДАННЫЕ: три плитки «Изображение / Товар / Коллекция», каждая со
 * своим плейсхолдером по типу. Ровно их конструктор показывает в дереве, пока
 * `props.items` нет: `findArrayField().defaultItems` подставляет
 * `defaultProps.items` из puck-config. Первая же правка мерчанта пишет этот
 * массив в props («Первая же правка запишет массив целиком в props»,
 * CustomFieldsPanel) — отсюда и «после любого действия всё работает».
 *
 * Поэтому материализуем их здесь, в данных, а не ветку рендера в пяти портах:
 * ветка воскрешала бы плитки, которые мерчант удалил осознанно.
 *
 * Правило ровно одно и то же, что у конструктора: `items` НЕ массив (ключа нет
 * — сид сняли демо-стриппером, либо ревизия старая) → кладём канон. `items`
 * есть, пусть и пустой массив — НЕ трогаем: `[]` пишет удаление плитки
 * (`deleteSubsection`, `handleItemDelete`), это осознанный выбор мерчанта.
 *
 * Идемпотентна: после прогона `items` — массив, второй проход проходит мимо.
 */
export function materializeGalleryItems(
  pagesData: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId] as PageData | undefined;
    if (!page || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = page.content.map((block) => {
      const b = block as { type?: string; props?: Record<string, unknown> };
      if (b?.type !== "Gallery") return block;
      const props = b.props ?? {};
      if (Array.isArray(props.items)) return block;
      pageChanged = true;
      return {
        ...b,
        props: {
          ...props,
          items: GALLERY_CANON_ITEMS.map((item) => ({ ...item })),
        },
      };
    });
    if (pageChanged) {
      out[pageId] = { ...(page as object), content };
      changed = true;
    }
  }
  return changed ? out : pagesData;
}
