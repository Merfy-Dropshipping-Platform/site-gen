// id экземпляров секций на странице (блок 1 «Секций и SDK», п. 10). id создаёт
// тот, кто добавляет секцию, — конструктор, позже MCP, — на другие секции он не
// смотрит. Повтор id на одной странице — ошибка записи ревизии
// section-id-duplicate, ничего не записано. Документ целиком проверяет
// StoreContentService.save, запись операциями (ops) — save-on-base.ts после
// операций. Проверяется ключ sections: у магазинов нынешних тем там списки
// имён, id в них нет.
// id блоков внутри экземпляра (часть 3, Р62): повтор в одном экземпляре — та же
// ошибка, id в списке повторов — «<экземпляр>/<блок>». Форму экземпляра и
// блоков sites не проверяет: не список, блок без строки id — не повтор.
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

// Повторы id в списке: каждое повторившееся значение — один раз.
const repeatedOf = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
};

// Повторы id блоков одного экземпляра (Р62): «<экземпляр>/<блок>», по порядку экземпляра.
const blockDuplicatesOf = (instance: Record<string, unknown>): string[] => {
  if (typeof instance.id !== "string") return [];
  return repeatedOf(idsOf(instance.blocks)).map((id) => `${instance.id}/${id}`);
};

export function sectionIdDuplicates(document: unknown): SectionIdDuplicate[] {
  if (!isRecord(document) || !isRecord(document.sections)) return [];
  return Object.entries(document.sections).flatMap(([page, list]) => {
    if (!Array.isArray(list)) return [];
    const instances = list.filter(isRecord);
    const duplicates = repeatedOf(idsOf(list)).map((id) => ({ page, id }));
    const blocks = instances.flatMap((instance) =>
      blockDuplicatesOf(instance).map((id) => ({ page, id })),
    );
    return [...duplicates, ...blocks];
  });
}

export function assertSectionIds(document: unknown): void {
  const duplicates = sectionIdDuplicates(document);
  if (duplicates.length > 0) throw new SectionIdDuplicateError(duplicates);
}
