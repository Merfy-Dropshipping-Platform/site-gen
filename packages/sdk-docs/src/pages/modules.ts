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
  share: 'Поделиться страницей: `page()` — окно «Поделиться» системы с названием и адресом, нет окна — адрес в буфер обмена. Скопировать текст: `copy({ text })` — в буфер обмена, а если буфера нет, запасным способом; потом уведомление «Скопировано»',
  page: 'Страница целиком: `$scroll` — доля прокрутки 0–100, `$leaving` — посетитель собирается уйти, `$now` — время сервера магазина в мс (до ответа сервера `null`). Секция с этим модулем получает вместо `ctx.page` объект с теми же `path` и `query` и этими тремя сторами. Скрипту секции без модуля `window` и `document` недоступны, поэтому положение прокрутки и время берутся отсюда',
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

// ext:<id> (блок 9, часть 9в; обещание блока 14): не модуль ядра, а расширение магазина — id задаёт мерчант, поэтому
// в MODULE_NAMES его нет. Подробности вызова — script.md.
const EXT_USE_ABOUT =
  '- `"ext:<id>"` — сторы и методы расширения магазина в `ctx.ext.<id>` (id расширения — строчные латинские буквы, цифры и дефис, 3–32 знака); раздел «ext:<id>» в конце страницы.';

// store:<префикс>:<имя> (свои сторы, 01.11): стор автора, а не модуль ядра — подробности в stores.md.
const STORE_USE_ABOUT =
  '- `"store:<префикс>:<имя>"` — свой стор магазина (`store:shop:<имя>`) или расширения (`store:<id>:<имя>`) в `ctx.stores[\'<префикс>:<имя>\']`, только для чтения — [stores.md](stores.md).';

const EXT_SECTION = [
  '## ext:<id>',
  '',
  'Расширение магазина: `"uses": ["ext:<id>"]` в `section.json` открывает скрипту секции `ctx.ext.<id>`. Сторы `$имя` читаются через `ctx.watch`, методы `имя(input, options)` вызывают функцию расширения и возвращают `Result`: `{ ok: true, data }` (`data` — выход функции) или `{ ok: false, error: { code, message } }`, вызов не бросает. Набор сторов и методов задаёт манифест расширения (`storefront.stores`, `storefront.methods`), SDK его заранее не знает. Коды ошибок, отказ расширения `refused` и `{ quiet: true }` — в [script.md](script.md#вызов-функции-расширения). Действия разметки: `data-action="ext.<id>.<метод>"`.',
].join('\n');

export function modulesPage(): string {
  const uses = SECTION_USES.map((use) => `- \`"${use}"\` — ${USES_ABOUT[use] ?? ''}.`).join('\n');
  const coreList = CORE.map((name) => `\`${name}\``).join(', ');
  const modules = MODULE_NAMES.map(moduleSection);
  return [
    'Ключ `uses` в `section.json` открывает секции данные и модули SDK. Значения:',
    '',
    uses,
    EXT_USE_ABOUT,
    STORE_USE_ABOUT,
    '',
    'Имя модуля SDK из разделов ниже — `ctx.<модуль>` в `script.ts`.',
    '',
    '## Модули в бандле страницы',
    '',
    `Модули ядра — ${coreList} — в бандле каждой страницы магазина. Остальные — только страниц, где секция объявила модуль в \`uses\` или поставила его действие в \`data-action\`: лишний модуль в \`uses\` — лишний код на каждой странице с этой секцией.`,
    '',
    ...modules,
    '',
    EXT_SECTION,
  ].join('\n');
}
