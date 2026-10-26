import type { CurrentSection } from '@merfy/storefront-sections';

// Чьё расширение — секция списка /sections (блок 12 «Секций и SDK», часть 12б, Р12б-10; конструктор — план 12г,
// Б12г-2): id расширения и его название (manifest.name из extensions.enabledForShop). Поле есть только у секции
// включённого расширения с названием; своим секциям магазина (shop:…) и при ответе extensions без name — ключа нет.
export interface SectionExtension {
  id: string;
  title: string;
}

// Секция, видимая магазину, и её расширение — для списка /sections.
export interface VisibleSection extends CurrentSection {
  extension?: SectionExtension;
}

export interface TitledExtension {
  id: string;
  title?: string;
}

// Полное имя «<id>:<имя>» → расширение из включённых, если у него есть название.
export function sectionExtensionOf(name: string, enabled: readonly TitledExtension[]): SectionExtension | undefined {
  const at = name.indexOf(':');
  if (at <= 0) return undefined;
  const id = name.slice(0, at);
  const title = enabled.find((item) => item.id === id)?.title;
  return title === undefined || title === '' ? undefined : { id, title };
}

// Ключ extension элемента списка: есть расширение — { extension }, нет — {} (ключа нет, а не undefined).
export const extensionKey = (section: VisibleSection): { extension?: SectionExtension } =>
  section.extension === undefined ? {} : { extension: section.extension };
