// Текст с начертаниями при записи ревизии (базовые секции, этап 0, E14): у полей string и text с ai значение — только
// <em> и <strong> без атрибутов, остальное вырезается до записи. Правило и очистка — одни с выводом:
// packages/storefront-sections/src/inline-text.ts (сборщик очищает ещё раз при сведении значений, шаблон выводит такое
// поле через set:html). Через запись идут конструктор и MCP (DocumentAdapter.commit). Поля берутся из manifest текущей
// правки (draft) секции магазина в storefront_section — как роли (section-roles.ts); секции расширений очищает вывод.
import { cleanInstanceInlineText } from "../../packages/storefront-sections/src/inline-text";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Документ ревизии с очищенными экземплярами секций, для которых есть manifest; остальное — как есть. Форма документа
// не меняется: другие ключи и экземпляры без manifest остаются теми же объектами.
export function cleanSectionText<T>(
  document: T,
  manifests: ReadonlyMap<string, unknown>,
): T {
  if (
    manifests.size === 0 ||
    !isRecord(document) ||
    !isRecord(document.sections)
  )
    return document;
  const sections = Object.fromEntries(
    Object.entries(document.sections).map(([list, entries]) => [
      list,
      Array.isArray(entries)
        ? entries.map((entry: unknown) => {
            const manifest =
              isRecord(entry) && typeof entry.section === "string"
                ? manifests.get(entry.section)
                : undefined;
            return manifest === undefined
              ? entry
              : cleanInstanceInlineText(manifest, entry);
          })
        : entries,
    ]),
  );
  return { ...document, sections } as T;
}
