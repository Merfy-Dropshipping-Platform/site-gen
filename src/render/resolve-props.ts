import type { Catalog, CatalogProduct } from "./catalog";
import { isPlaceholderImage, isUnsetContent } from "./empty-state";
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
      const unset =
        isUnsetContent(text) ||
        (typeof value === "string" && isPlaceholderImage(value)) ||
        (defaults && defaults[key] !== undefined && JSON.stringify(value) === JSON.stringify(defaults[key]));
      fields[key] = { role, set: !unset, value: unset ? undefined : value };
      if (unset) {
        if (key === "heading" && value && typeof value === "object") {
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
