import { ACTIONS, MODULE_NAMES } from '@merfy/shell/actions';
import coreParts from '@merfy/shell/core-parts.json';
import { SECTION_USES } from '@merfy/storefront-sections';

// modules.md (блок 14; блок 15, часть 15ж, Р15ж-10): значения uses, а по модулям SDK — что даёт каждый и в бандле
// каких страниц он оказывается. Модули ядра — по core-parts.json, остальные — по uses и data-action секций.
const USES_ABOUT: Readonly<Record<string, string>> = {
  theme: 'значения сквозных настроек темы в Astro.props.theme',
  shop: 'публичные данные магазина в Astro.props.shop',
};

type ModuleName = (typeof MODULE_NAMES)[number];

// Новый модуль без строки здесь — ошибка типов (блок 15, часть 15ж).
const MODULE_ABOUT: Readonly<Record<ModuleName, string>> = {
  cart: 'Корзина: `$cart`, `$count`, `$totals`, `$total`; добавить, поменять, убрать, открыть корзину, перейти в оформление',
  favorites: 'Избранное: `$favorites`, `$count`, `$products` — карточки отмеченных; отметить и снять отметку',
  customer:
    'Кто вошёл: `$customer` — `{ ready, customer }`, `customer` — e-mail, имя, телефон или `null`. Для шапки и ссылки «Профиль»; входа, выхода и профиля здесь нет',
  auth: 'Вход по коду из письма, выход и профиль: `$customer`, `requestCode`, `verify`, `signout`, `updateProfile`. Для секций входа и личного кабинета; секции, которой нужно только «вошла или нет», хватит `customer` — `auth` добавляет в бандл страницы код входа',
  newsletter: 'Подписка на рассылку: `subscribe({ email })`',
  consent: 'Согласие на cookie: `$consent`; принять, отклонить',
  variants: 'Варианты товара страницы: `of(productId)`, выбрать значение группы',
  search: 'Поиск: `query`, открыть панель поиска',
  catalog: 'Товары каталога: `products(query)` — страница товаров с фильтрами',
  orders: 'Заказы покупательницы: `list`, `get`, `cancel`',
  files: 'Файлы покупательницы для форм расширений: `chosen`, `upload`, `preview`, `forget`',
};

const CORE: readonly string[] = coreParts.core;

const placeOf = (module: string): string =>
  CORE.includes(module)
    ? 'В бандле каждой страницы магазина (ядро).'
    : 'В бандле только страниц, где секция объявила модуль в `uses` или поставила его действие в `data-action`.';

const actionsOf = (module: string): string[] =>
  Object.entries(ACTIONS)
    .filter(([, spec]) => spec.module === module)
    .map(([name]) => `\`${name}\``);

const moduleSection = (module: ModuleName): string => {
  const actions = actionsOf(module);
  const actionsText = actions.length === 0 ? 'Действий разметки нет.' : `Действия: ${actions.join(', ')}.`;
  return `## ${module}\n\n${MODULE_ABOUT[module]}. ${placeOf(module)}\n\n${actionsText}`;
};

export function modulesPage(): string {
  const uses = SECTION_USES.map((use) => `- \`"${use}"\` — ${USES_ABOUT[use] ?? ''}.`).join('\n');
  const coreList = CORE.map((name) => `\`${name}\``).join(', ');
  const modules = MODULE_NAMES.map(moduleSection);
  return [
    'Ключ `uses` в `section.json` открывает секции данные и модули SDK. Значения:',
    '',
    uses,
    '',
    'Имя модуля SDK из разделов ниже — `ctx.<модуль>` в `script.ts`.',
    '',
    '## Модули в бандле страницы',
    '',
    `Модули ядра — ${coreList} — в бандле каждой страницы магазина. Остальные — только страниц, где секция объявила модуль в \`uses\` или поставила его действие в \`data-action\`: лишний модуль в \`uses\` — лишний код на каждой странице с этой секцией.`,
    '',
    ...modules,
  ].join('\n');
}
