/**
 * Порядок именованных параметров секции — перетаскивание в дереве слева.
 *
 * Конструктор (PR constructor #38) пишет порядок в `props.fieldOrder: string[]`
 * — имена полей панели (реестр NAMED_SUBSECTIONS конструктора,
 * src/lib/utils/arrayField.ts). Ручки перетаскивания в дереве появляются,
 * только если puckConfig секции объявляет скрытое поле `fieldOrder`, поэтому
 * каждая секция из `SECTION_FIELDS` обязана и объявить поле, и рисовать
 * параметры в этом порядке (сторож: src/themes/__tests__/section-field-order.spec.ts).
 *
 * Правило — данными, без веток под тему: известные имена из `fieldOrder` в
 * заданном порядке (без дублей), недостающие — следом в порядке реестра.
 * Нет `fieldOrder`, пустой массив или не массив → реестр как есть — ровно
 * нынешний вид секции. Неизвестные имена (в т.ч. `image` у «Изображения с
 * текстом»: свою сторону картинка берёт из «Позиции фото») отбрасываются.
 */

/**
 * Переставляемые параметры секций — в порядке реестра конструктора.
 * «Изображение с текстом»: только текстовая колонка (картинку не двигаем).
 * «Подписка на рассылку»: `heading` — блок заголовка с текстом, `buttonText` —
 * форма подписки (поле, кнопка и согласие под ней).
 * «Товар»: все восемь строк дерева колонки информации; галерея фото в дереве
 * не параметр — её сторону задаёт «Позиция фото», она не переставляется.
 */
export const SECTION_FIELDS = {
  ImageWithText: ["heading", "text", "button"],
  Hero: ["heading", "text", "buttons"],
  MainText: ["heading", "text", "button"],
  Newsletter: ["heading", "buttonText"],
  Product: [
    "text",
    "title",
    "price",
    "variants",
    "quantity",
    "buttons",
    "description",
    "share",
  ],
} as const;

export type OrderedSection = keyof typeof SECTION_FIELDS;
export type SectionField<S extends OrderedSection> =
  (typeof SECTION_FIELDS)[S][number];

export const TEXT_COLUMN_FIELDS = SECTION_FIELDS.ImageWithText;

export type TextColumnField = (typeof TEXT_COLUMN_FIELDS)[number];

type OrderProps =
  | { fieldOrder?: unknown }
  | Record<string, unknown>
  | undefined;

/** Порядок полей `base` по `props.fieldOrder`; недостающие — следом, по `base`. */
export function orderFields<F extends string>(
  props: OrderProps,
  base: readonly F[],
): F[] {
  const raw = (props as { fieldOrder?: unknown } | undefined)?.fieldOrder;
  const wanted = Array.isArray(raw) ? raw : [];
  const known = wanted.filter((f): f is F =>
    (base as readonly unknown[]).includes(f),
  );
  return [...new Set([...known, ...base])];
}

/** Порядок параметров секции из реестра `SECTION_FIELDS`. */
export function sectionFieldOrder<S extends OrderedSection>(
  section: S,
  props: OrderProps,
): SectionField<S>[] {
  return orderFields(
    props,
    SECTION_FIELDS[section] as readonly SectionField<S>[],
  );
}

/** «Изображение с текстом»: заголовок/текст/кнопка текстовой колонки. */
export function orderTextFields(
  props: OrderProps,
  base: readonly TextColumnField[] = TEXT_COLUMN_FIELDS,
): TextColumnField[] {
  return orderFields(props, base);
}

/**
 * Отрезок порядка: либо несколько СОСЕДНИХ полей одной группы (у тем заголовок
 * и текст живут в общей колонке со своим плотным ритмом), либо одно поле.
 */
export type FieldRun<F extends string> = { grouped: boolean; fields: F[] };

/**
 * Режет порядок на отрезки: соседние поля из `together` сливаются в один
 * (общая обёртка темы), остальные идут по одному. Порядок реестра даёт ровно
 * прежнюю разметку: `[heading, text, button]` → `[[heading, text], [button]]`.
 * Переставленный заголовок уходит в свою обёртку, а зазор между обёртками —
 * тот же, что у темы между колонкой и кнопкой.
 */
export function fieldRuns<F extends string>(
  order: readonly F[],
  together: readonly F[],
): FieldRun<F>[] {
  const inGroup = (f: F) => together.includes(f);
  return order.reduce<FieldRun<F>[]>((runs, field) => {
    const last = runs[runs.length - 1];
    const joins = inGroup(field) && last?.grouped;
    if (joins) last.fields.push(field);
    else runs.push({ grouped: inGroup(field), fields: [field] });
    return runs;
  }, []);
}
