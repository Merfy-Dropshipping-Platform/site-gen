import type { Catalog, CatalogProduct, CatalogPublication } from "./catalog";
import { isBlankContent, isPlaceholderImage } from "./empty-state";
import { inferFieldRole, type FieldState } from "./field-roles";
import { applySectionPolicy } from "./section-policy";

export type ResolvedMerfy = {
  fields: Record<string, FieldState>;
  resolved: {
    popularProducts: CatalogProduct[] | null;
    collectionTiles: Array<{
      collectionId: string | null;
      name: string;
      image: string;
      href: string;
    }> | null;
    /**
     * Публикации магазина для секции «Публикации» (null — блок не публикации).
     * Пустой массив = у магазина публикаций нет / выбранной больше нет; блок
     * рисует заглушку и НЕ выдумывает записи.
     */
    publications: CatalogPublication[] | null;
  };
};

function headingText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string") {
    return (raw as { text: string }).text;
  }
  return "";
}

export function resolveBlockProps(
  blockName: string,
  props: Record<string, unknown>,
  catalog: Catalog,
  defaults?: Record<string, unknown>,
): { props: Record<string, unknown>; merfy: Omit<ResolvedMerfy, never> } {
  const fields: Record<string, FieldState> = {};
  const out: Record<string, unknown> = { ...props };

  for (const [key, value] of Object.entries(props)) {
    const role = inferFieldRole(key);
    if (role === "meta") continue;
    if (role === "style") {
      fields[key] = { role, set: value !== undefined && value !== null, value };
      continue;
    }
    if (role === "content") {
      const text = key === "heading" || key === "title" ? headingText(value) : value;
      // Что лежит в поле, то и рендерится: пустое (или из пробелов) поле уходит
      // блоку пустой строкой, и блок его не рисует (владелец 26.09). Словарь
      // служебных слов и сравнение с дефолтом блока здесь больше не применяются —
      // они съедали нормальный ввод («Видео», «Коллекция»).
      const unset = isBlankContent(text) || (typeof value === "string" && isPlaceholderImage(value));
      fields[key] = { role, set: !unset, value: unset ? undefined : value };
      if (unset) {
        // Конверт без текста (`heading: {size}` — мерчант сменил размер, но
        // заголовок не заполнял) — это «не задано», а не «стёрто»: `text` не
        // дописываем, иначе порт не отличит его от стёртого поля и уберёт
        // заглушку темы. Пустую строку ставим только тому, что уже было строкой.
        const envelopeText = value && typeof value === "object" ? (value as { text?: unknown }).text : undefined;
        if (key === "heading" && typeof envelopeText === "string") {
          out[key] = { ...(value as object), text: "" };
        } else if (typeof value === "string") {
          out[key] = "";
        }
      }
      continue;
    }
    if (role === "catalog") {
      const ref = typeof value === "string" ? value.trim() : "";
      fields[key] = { role, set: !!ref, value: ref || null };
    }
  }

  // collections[] слоты
  const slots = Array.isArray(props.collections) ? (props.collections as Array<Record<string, unknown>>) : [];
  const picked = slots.filter((s) => typeof s?.collectionId === "string" && s.collectionId.trim());
  fields["collections"] = {
    role: "catalog",
    set: picked.length > 0,
    value: picked.map((s) => s.collectionId),
  };

  const resolved = applySectionPolicy(blockName, props, catalog, fields);
  return { props: out, merfy: { fields, resolved } };
}
