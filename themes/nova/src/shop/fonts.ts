// Шрифты темы nova (design.md блока 9, «решил сам» 4): единственное место, где тема подключает файлы шрифтов. Модуль
// берут страница магазина (ShopHead.astro), стенд в превью конструктора (pages/theme-stand.astro) и стенд блока 2
// (src/stand/StandPage.astro). Лежит в src/shop — файлы шрифтов входят в отпечаток темы (блок 4). Начертания совпадают
// с theme.json: семейство — первое имя стека font-body и font-heading, насыщенности — weight-body и weight-heading;
// это сторожит тест packages/stand-check/__tests__/nova-theme.test.ts. До блока 12 — пакеты Fontsource в сборке темы,
// без запросов к Google.
import "@fontsource/onest/400.css";
import "@fontsource/onest/600.css";
