export const SABOTAGE_NAMES = ['script', 'global', 'cart'] as const;
export type SabotageName = (typeof SABOTAGE_NAMES)[number];

// Поломки для приёмки (design.md, раздел 8): скрипт ставится до загрузки страницы через page.addInitScript.
// Лишний скрипт, глобал __MERFY_*__ и другой ключ корзины — каждая обязана дать красный.
export const SABOTAGE: Record<SabotageName, string> = {
  script: [
    "document.addEventListener('DOMContentLoaded', () => {",
    "  const extra = document.createElement('script');",
    "  extra.textContent = 'window.standExtra = true;';",
    '  document.head.append(extra);',
    '});',
  ].join('\n'),
  global: "window.__MERFY_SITE_ID__ = 'demo-site';",
  cart: "localStorage.setItem('cart:v2', 'stand');",
};
