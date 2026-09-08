export type FieldRole = "content" | "style" | "catalog" | "meta";

const CATALOG_KEYS = new Set([
  "collection",
  "collectionid",
  "productid",
  "datasource",
]);
const CONTENT_KEYS = new Set([
  "heading",
  "text",
  "subtitle",
  "title",
  "image",
  "content",
  "description",
  "buttontext",
  "buttonlabel",
  "morelabel",
  "placeholder",
  "eyebrow",
  "caption",
]);
const META_KEYS = new Set(["id", "siteid", "__merfy"]);

export type FieldState = { role: FieldRole; set: boolean; value: unknown };

export function inferFieldRole(key: string, parentKey?: string): FieldRole {
  const k = key.toLowerCase();
  if (META_KEYS.has(k) || k.startsWith("__")) return "meta";
  if (CATALOG_KEYS.has(k)) return "catalog";
  if (parentKey === "collections" && k === "collectionid") return "catalog";
  if (CONTENT_KEYS.has(k)) return "content";
  return "style";
}
