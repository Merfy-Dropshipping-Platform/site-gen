/**
 * Адрес поля документа: строка сегментов через `/`.
 *
 * Сегменты:
 *  - `order` — порядок элементов списка;
 *  - `page:<id>`, `block:<id>`, `zone:<ключ>` — элемент списка или записи по id;
 *  - всё остальное — ключ объекта.
 *
 * Экранирование (как JSON Pointer, плюс двоеточие): `~` → `~0`, `/` → `~1`,
 * в ключах ещё `:` → `~2`, чтобы ключ не выглядел как `page:…`. Буквальный
 * ключ `order` пишется `~3order`. Внутри id с префиксом двоеточие остаётся как
 * есть: префикс уже определён первым двоеточием (`zone:Columns-1:left`).
 */

export const ORDER_SEGMENT = "order";

/** Префиксы элементов. Какой префикс где живёт — форма документа (shape.ts). */
const PREFIXES = ["page:", "block:", "zone:"] as const;

const UNESCAPE: Record<string, string> = { "~0": "~", "~1": "/", "~2": ":" };

export type ParsedSegment =
  | { kind: "key"; key: string }
  | { kind: "prefixed"; prefix: string; id: string }
  | { kind: "order" };

function escapeId(id: string): string {
  return id.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function keySegment(key: string): string {
  const escaped = escapeId(key).replace(/:/g, "~2");
  return escaped === ORDER_SEGMENT ? `~3${escaped}` : escaped;
}

/** Элемент по id; пустой префикс (страницы в `pages[]`) — сегмент как у ключа. */
export function itemSegment(prefix: string, id: string): string {
  return prefix ? prefix + escapeId(id) : keySegment(id);
}

function unescapeSegment(segment: string): string {
  const body = segment.startsWith("~3") ? segment.slice(2) : segment;
  return body.replace(/~[012]/g, (m) => UNESCAPE[m]);
}

export function parseSegment(segment: string): ParsedSegment {
  if (segment === ORDER_SEGMENT) return { kind: "order" };
  const prefix = PREFIXES.find((p) => segment.startsWith(p));
  if (prefix)
    return {
      kind: "prefixed",
      prefix,
      id: unescapeSegment(segment.slice(prefix.length)),
    };
  return { kind: "key", key: unescapeSegment(segment) };
}

export function joinPath(parent: string, segment: string): string {
  return parent === "" ? segment : `${parent}/${segment}`;
}

export function splitPath(path: string): string[] {
  return path === "" ? [] : path.split("/");
}

/** Родительский адрес (без последнего сегмента). */
export function parentPath(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

/** `outer` равен `inner` или содержит его. */
export function covers(outer: string, inner: string): boolean {
  return outer === "" || outer === inner || inner.startsWith(`${outer}/`);
}

/** Два адреса задевают одно место: равны или один внутри другого. */
export function overlaps(a: string, b: string): boolean {
  return covers(a, b) || covers(b, a);
}
