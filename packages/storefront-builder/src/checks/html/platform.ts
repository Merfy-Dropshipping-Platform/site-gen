// Секции платформы на странице (19.11, место `html`: HTML без браузера). Секции нашей библиотеки лежат в магазине как
// его собственные (`shop:…`, блок 1 «Секций и SDK»), поэтому по префиксу имени их не отличить. Отличает роль: у секции,
// которой управляет ядро SDK (корзина, согласие, оформление, уведомления…), сборка ставит на обёртку `data-role`
// (`wrapper` в storefront-build/src/sections-render.ts). Имён секций здесь нет, только роль как таковая.
const SECTION_TAG = /<merfy-section\b[^>]*>/g;

const attributeOf = (tag: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

// id экземпляров (`data-section-id`) секций с ролью.
export function platformSections(html: string): Set<string> {
  const ids = [...html.matchAll(SECTION_TAG)]
    .filter(([tag]) => attributeOf(tag, 'data-role') !== null)
    .map(([tag]) => attributeOf(tag, 'data-section-id'));
  return new Set(ids.filter((id): id is string => id !== null));
}
