// id экземпляров секций на странице (блок 1 «Секций и SDK», п. 10). id создаёт
// тот, кто добавляет секцию, — конструктор, позже MCP, — на другие секции он не
// смотрит. Повтор id на одной странице — ошибка записи ревизии
// section-id-duplicate, ничего не записано. Документ целиком проверяет
// StoreContentService.save, запись операциями (ops) — save-on-base.ts после
// операций. Проверяется ключ sections: у магазинов нынешних тем там списки
// имён, id в них нет.
export interface SectionIdDuplicate {
  page: string;
  id: string;
}

export class SectionIdDuplicateError extends Error {
  constructor(readonly duplicates: SectionIdDuplicate[]) {
    super("section-id-duplicate");
    this.name = "SectionIdDuplicateError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const idsOf = (list: unknown): string[] =>
  Array.isArray(list)
    ? list.flatMap((item) =>
        isRecord(item) && typeof item.id === "string" ? [item.id] : [],
      )
    : [];

export function sectionIdDuplicates(document: unknown): SectionIdDuplicate[] {
  if (!isRecord(document) || !isRecord(document.sections)) return [];
  return Object.entries(document.sections).flatMap(([page, list]) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const id of idsOf(list)) (seen.has(id) ? repeated : seen).add(id);
    return [...repeated].map((id) => ({ page, id }));
  });
}

export function assertSectionIds(document: unknown): void {
  const duplicates = sectionIdDuplicates(document);
  if (duplicates.length > 0) throw new SectionIdDuplicateError(duplicates);
}
