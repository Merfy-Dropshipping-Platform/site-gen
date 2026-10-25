// Один экземпляр секции с ролью в ревизии (блок 12 «Секций и SDK», 12.1, «Решил сам» п. 5; часть 12а): второй экземпляр
// той же роли где угодно в ключе sections — ошибка записи role-duplicate, ничего не записано. Роли секций читает
// адаптер из storefront_section (manifest текущей правки); документ без экземпляров shop:… базу не трогает.
export interface RoleDuplicate {
  role: string;
  // Все экземпляры роли по порядку документа: «<список>/<id экземпляра>».
  ids: string[];
}

export class RoleDuplicateError extends Error {
  constructor(readonly duplicates: RoleDuplicate[]) {
    super("role-duplicate");
    this.name = "RoleDuplicateError";
  }
}

export type ReadRoles = (
  siteId: string,
  names: readonly string[],
) => Promise<ReadonlyMap<string, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Экземпляры секций документа: «<список>/<id>» с именем секции, по порядку ключа sections.
const placedInstances = (
  document: unknown,
): { list: string; id: string; section: string }[] => {
  if (!isRecord(document) || !isRecord(document.sections)) return [];
  return Object.entries(document.sections).flatMap(([list, entries]) => {
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        typeof entry.section !== "string"
      )
        return [];
      return [{ list, id: entry.id, section: entry.section }];
    });
  });
};

// Имена секций магазина в документе (shop:…), по первому появлению, без повторов.
export function placedShopSections(document: unknown): string[] {
  const names = new Set<string>();
  for (const instance of placedInstances(document))
    if (instance.section.startsWith("shop:")) names.add(instance.section);
  return [...names];
}

// Повторы ролей документа по карте «имя секции → роль».
export function roleDuplicates(
  document: unknown,
  roles: ReadonlyMap<string, string>,
): RoleDuplicate[] {
  const byRole = new Map<string, string[]>();
  for (const instance of placedInstances(document)) {
    const role = roles.get(instance.section);
    if (role === undefined) continue;
    const ids = byRole.get(role) ?? [];
    ids.push(`${instance.list}/${instance.id}`);
    byRole.set(role, ids);
  }
  return [...byRole.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([role, ids]) => ({ role, ids }));
}

// Проверка документов одной записи: первый документ с повтором — RoleDuplicateError.
export async function assertRoleInstances(
  read: ReadRoles,
  siteId: string,
  documents: readonly unknown[],
): Promise<void> {
  const names = new Set<string>();
  for (const document of documents)
    for (const name of placedShopSections(document)) names.add(name);
  if (names.size === 0) return;
  const roles = await read(siteId, [...names]);
  for (const document of documents) {
    const duplicates = roleDuplicates(document, roles);
    if (duplicates.length > 0) throw new RoleDuplicateError(duplicates);
  }
}
