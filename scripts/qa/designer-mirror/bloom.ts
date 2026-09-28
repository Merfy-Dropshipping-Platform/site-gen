import type { Mirror } from "./index";

/**
 * Главная bloom.merfy.ru (Bloom-theme @5aae2ad6, src/pages/index.astro):
 * Header (промо + шапка) → Hero → Collections («Сейчас в тренде», 6 товаров)
 * → Philosophy (текст + кнопка) → Gallery (фото + карточка товара) →
 * Benefits (3 карточки с иконками) → Footer.
 *
 * Наши пары: PromoBanner+Header, Hero, PopularProducts, MainText, Gallery,
 * MultiColumns, Footer. Поля — только из панелей секций (theme-base
 * *.puckConfig.ts); скрытые поля шапки и подвала (меню, логотип, контакты,
 * политики) у мерчанта заполняются из настроек магазина — здесь в них то же,
 * что у верстальщиков.
 */
const SITE = "https://bloom.merfy.ru";
const IMG = `${SITE}/images`;

/** src/data/products.ts: catalogProducts.slice(0, 6) — формат storefront-data. */
const TREND = [
  { name: "Крем-флюид с гелевой текстурой", price: 1940, old: 2490, volume: "50 мл" },
  { name: "Маска для волос", price: 1490, volume: "220 мл" },
  { name: "Крем для лица", price: 2690, volume: "50 мл" },
  { name: "Увлажняющее молочко", price: 1190, volume: "150 мл" },
  { name: "Блеск для губ", price: 490 },
  { name: "Сыворотка для лица", price: 3490, old: 3990 },
];
const products = TREND.map((t, i) => ({
  id: `bag-${i + 1}`,
  name: t.name,
  slug: `bag-${i + 1}`,
  images: [`${IMG}/trend-${i + 1}.webp`],
  basePrice: t.price,
  compareAtPrice: t.old ?? null,
  inStock: true,
  volume: t.volume,
}));

const BENEFITS = [
  {
    title: "Натуральные ингредиенты",
    description:
      "Подарите своей коже лучшее. Натуральные масла и экстракты в нашей косметике питают и восстанавливают, сохраняя вашу красоту естественно и безопасно.",
  },
  {
    title: "Эксперты рекомендуют",
    description:
      "Выбор практикующих косметологов. Формула протестирована и рекомендована экспертами в области эстетической медицины. Доверьтесь профессионалам, которые знают о коже всё.",
  },
  {
    title: "Качественный состав",
    description:
      "Безупречный состав: тщательно подобранные активные ингредиенты высшей очистки. Мы выбираем лучшее, чтобы ваша кожа получала идеальный уход каждый день.",
  },
];

/**
 * Логотип магазина — файл брендинга (у верстальщиков /icons/Bloom.svg, 65×19).
 * Картинки самой темы (/icons/…) наши шапка и подвал сознательно не берут за
 * логотип магазина, поэтому тот же файл идёт как загруженный: data-URI.
 */
const LOGO = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjUiIGhlaWdodD0iMTkiIHZpZXdCb3g9IjAgMCA2NSAxOSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTAgMTguNjc2M1YxLjI0NTA5SDUuOTM3MUM2Ljc4OTM1IDEuMjQ1MDkgNy41NjM3NiAxLjQyMzU1IDguMjYwMzEgMS43ODA0N0M4Ljk2NTA2IDIuMTI5MSA5LjUyMjMgMi42Mzk1OCA5LjkzMjA0IDMuMzExOTNDMTAuMzQxOCAzLjk4NDI3IDEwLjU0NjYgNC43ODk0MyAxMC41NDY2IDUuNzI3MzlDMTAuNTQ2NiA2LjIzMzczIDEwLjQ2MDYgNi43MjM0NiAxMC4yODg1IDcuMTk2NTlDMTAuMTI0NiA3LjY2MTQyIDkuODk1MTYgOC4wNjQgOS42MDAxNSA4LjQwNDMyQzkuMzEzMzQgOC43MzYzNSA4Ljk4NTU1IDguOTYwNDYgOC42MTY3OCA5LjA3NjY3QzkuMTMzMDUgOS4yMDk0OCA5LjU3MTQ3IDkuNDQ2MDUgOS45MzIwNCA5Ljc4NjM3QzEwLjI5MjYgMTAuMTE4NCAxMC41ODM1IDEwLjUwODUgMTAuODA0OCAxMC45NTY3QzExLjAzNDIgMTEuNDA1IDExLjE5ODEgMTEuODc0IDExLjI5NjUgMTIuMzYzN0MxMS4zOTQ4IDEyLjg1MzQgMTEuNDQ0IDEzLjMyNjYgMTEuNDQ0IDEzLjc4MzFDMTEuNDQ0IDE0Ljc0NiAxMS4yMjY4IDE1LjU5NjggMTAuNzkyNSAxNi4zMzU1QzEwLjM2NjQgMTcuMDY2IDkuNzkyNzMgMTcuNjM4NyA5LjA3MTU5IDE4LjA1MzdDOC4zNTA0NSAxOC40Njg4IDcuNTU1NTYgMTguNjc2MyA2LjY4NjkyIDE4LjY3NjNIMFpNMi4wNjUwOCAxNi44MzM1SDYuNTAyNTRDNy4wNjc5NyAxNi44MzM1IDcuNTgwMTUgMTYuNjg4MyA4LjAzOTA1IDE2LjM5NzhDOC41MDYxNSAxNi4wOTg5IDguODc5MDEgMTUuNjkyMiA5LjE1NzY0IDE1LjE3NzZDOS40MzYyNiAxNC42NjMgOS41NzU1NyAxNC4wODE5IDkuNTc1NTcgMTMuNDM0NUM5LjU3NTU3IDEyLjg2MTcgOS40MzYyNiAxMi4zMjIyIDkuMTU3NjQgMTEuODE1OUM4Ljg3OTAxIDExLjMwMTIgOC41MDYxNSAxMC44ODYyIDguMDM5MDUgMTAuNTcwOEM3LjU4MDE1IDEwLjI1NTQgNy4wNjc5NyAxMC4wOTc2IDYuNTAyNTQgMTAuMDk3NkgyLjA2NTA4VjE2LjgzMzVaTTIuMDY1MDggOC4yOTIyN0g1Ljc0MDQyQzYuNDk0MzQgOC4yOTIyNyA3LjEzNzYzIDguMDY4MTUgNy42NzAyOSA3LjYxOTkyQzguMjExMTQgNy4xNjMzOSA4LjQ4MTU3IDYuNTI4NCA4LjQ4MTU3IDUuNzE0OTRDOC40ODE1NyA0LjgzNTA4IDguMjExMTQgNC4xNzkzNCA3LjY3MDI5IDMuNzQ3NzFDNy4xMzc2MyAzLjMwNzc4IDYuNDk0MzQgMy4wODc4MSA1Ljc0MDQyIDMuMDg3ODFIMi4wNjUwOFY4LjI5MjI3WiIgZmlsbD0iI0UzOEU5RiIvPgo8cGF0aCBkPSJNMTMuNjEyNiAxOC42NzYzVjBIMTUuNjc3NlYxOC42NzYzSDEzLjYxMjZaIiBmaWxsPSIjRTM4RTlGIi8+CjxwYXRoIGQ9Ik0yMy45MTg4IDE5QzIyLjc4NzkgMTkgMjEuNzU1MyAxOC43MDUzIDIwLjgyMTEgMTguMTE2QzE5Ljg5NTEgMTcuNTI2NiAxOS4xNTM1IDE2LjczODEgMTguNTk2MyAxNS43NTAzQzE4LjA0NzIgMTQuNzU0MyAxNy43NzI3IDEzLjY1NDQgMTcuNzcyNyAxMi40NTA5QzE3Ljc3MjcgMTEuNTM3OCAxNy45MzI1IDEwLjY4NyAxOC4yNTIxIDkuODk4NDNDMTguNTcxNyA5LjEwMTU3IDE5LjAxMDEgOC40MDQzMiAxOS41NjczIDcuODA2NjhDMjAuMTMyOCA3LjIwMDc0IDIwLjc4ODQgNi43Mjc2MSAyMS41MzQxIDYuMzg3MjlDMjIuMjc5OCA2LjA0Njk2IDIzLjA3NDcgNS44NzY4IDIzLjkxODggNS44NzY4QzI1LjA0OTYgNS44NzY4IDI2LjA3ODEgNi4xNzE0NyAyNy4wMDQxIDYuNzYwODFDMjcuOTM4MyA3LjM1MDE1IDI4LjY3OTkgOC4xNDI4NiAyOS4yMjkgOS4xMzg5MkMyOS43ODYyIDEwLjEzNSAzMC4wNjQ4IDExLjIzOSAzMC4wNjQ4IDEyLjQ1MDlDMzAuMDY0OCAxMy4zNTU2IDI5LjkwNSAxNC4yMDIzIDI5LjU4NTQgMTQuOTkwOEMyOS4yNjU4IDE1Ljc3OTQgMjguODIzMyAxNi40NzY2IDI4LjI1NzkgMTcuMDgyNkMyNy43MDA2IDE3LjY4MDIgMjcuMDQ5MSAxOC4xNDkyIDI2LjMwMzQgMTguNDg5NUMyNS41NjU5IDE4LjgyOTggMjQuNzcxIDE5IDIzLjkxODggMTlaTTIzLjkxODggMTYuOTA4M0MyNC42ODkxIDE2LjkwODMgMjUuMzgxNSAxNi43MDQ5IDI1Ljk5NjEgMTYuMjk4MkMyNi42MTg5IDE1Ljg4MzEgMjcuMTA2NSAxNS4zMzk0IDI3LjQ1ODkgMTQuNjY3MUMyNy44MTk1IDEzLjk4NjUgMjcuOTk5NyAxMy4yNDc3IDI3Ljk5OTcgMTIuNDUwOUMyNy45OTk3IDExLjYzNzQgMjcuODE1NCAxMC44OTAzIDI3LjQ0NjYgMTAuMjA5N0MyNy4wODYgOS41MjkwNSAyNi41OTg0IDguOTg1MzYgMjUuOTgzOCA4LjU3ODY0QzI1LjM2OTIgOC4xNzE5MSAyNC42ODA5IDcuOTY4NTUgMjMuOTE4OCA3Ljk2ODU1QzIzLjE0ODQgNy45Njg1NSAyMi40NTYgOC4xNzYwNiAyMS44NDE0IDguNTkxMDlDMjEuMjI2OCA4Ljk5NzgyIDIwLjczOTIgOS41NDE1IDIwLjM3ODYgMTAuMjIyMUMyMC4wMTggMTAuOTAyOCAxOS44Mzc4IDExLjY0NTcgMTkuODM3OCAxMi40NTA5QzE5LjgzNzggMTMuMjgwOSAyMC4wMjIxIDE0LjAzNjMgMjAuMzkwOSAxNC43MTY5QzIwLjc1OTcgMTUuMzg5MyAyMS4yNTU1IDE1LjkyNDYgMjEuODc4MyAxNi4zMjMxQzIyLjUwMTEgMTYuNzEzMiAyMy4xODEyIDE2LjkwODMgMjMuOTE4OCAxNi45MDgzWiIgZmlsbD0iI0UzOEU5RiIvPgo8cGF0aCBkPSJNMzcuNDM1MyAxOUMzNi4zMDQ0IDE5IDM1LjI3MTkgMTguNzA1MyAzNC4zMzc3IDE4LjExNkMzMy40MTE3IDE3LjUyNjYgMzIuNjcgMTYuNzM4MSAzMi4xMTI4IDE1Ljc1MDNDMzEuNTYzOCAxNC43NTQzIDMxLjI4OTIgMTMuNjU0NCAzMS4yODkyIDEyLjQ1MDlDMzEuMjg5MiAxMS41Mzc4IDMxLjQ0OSAxMC42ODcgMzEuNzY4NiA5Ljg5ODQzQzMyLjA4ODIgOS4xMDE1NyAzMi41MjY2IDguNDA0MzIgMzMuMDgzOSA3LjgwNjY4QzMzLjY0OTMgNy4yMDA3NCAzNC4zMDQ5IDYuNzI3NjEgMzUuMDUwNiA2LjM4NzI5QzM1Ljc5NjMgNi4wNDY5NiAzNi41OTEyIDUuODc2OCAzNy40MzUzIDUuODc2OEMzOC41NjYyIDUuODc2OCAzOS41OTQ2IDYuMTcxNDcgNDAuNTIwNiA2Ljc2MDgxQzQxLjQ1NDggNy4zNTAxNSA0Mi4xOTY0IDguMTQyODYgNDIuNzQ1NSA5LjEzODkyQzQzLjMwMjcgMTAuMTM1IDQzLjU4MTQgMTEuMjM5IDQzLjU4MTQgMTIuNDUwOUM0My41ODE0IDEzLjM1NTYgNDMuNDIxNiAxNC4yMDIzIDQzLjEwMiAxNC45OTA4QzQyLjc4MjQgMTUuNzc5NCA0Mi4zMzk4IDE2LjQ3NjYgNDEuNzc0NCAxNy4wODI2QzQxLjIxNzIgMTcuNjgwMiA0MC41NjU3IDE4LjE0OTIgMzkuODIgMTguNDg5NUMzOS4wODI0IDE4LjgyOTggMzguMjg3NSAxOSAzNy40MzUzIDE5Wk0zNy40MzUzIDE2LjkwODNDMzguMjA1NiAxNi45MDgzIDM4Ljg5ODEgMTYuNzA0OSAzOS41MTI3IDE2LjI5ODJDNDAuMTM1NSAxNS44ODMxIDQwLjYyMzEgMTUuMzM5NCA0MC45NzU0IDE0LjY2NzFDNDEuMzM2IDEzLjk4NjUgNDEuNTE2MyAxMy4yNDc3IDQxLjUxNjMgMTIuNDUwOUM0MS41MTYzIDExLjYzNzQgNDEuMzMxOSAxMC44OTAzIDQwLjk2MzEgMTAuMjA5N0M0MC42MDI2IDkuNTI5MDUgNDAuMTE1IDguOTg1MzYgMzkuNTAwNCA4LjU3ODY0QzM4Ljg4NTggOC4xNzE5MSAzOC4xOTc0IDcuOTY4NTUgMzcuNDM1MyA3Ljk2ODU1QzM2LjY2NSA3Ljk2ODU1IDM1Ljk3MjUgOC4xNzYwNiAzNS4zNTc5IDguNTkxMDlDMzQuNzQzMyA4Ljk5NzgyIDM0LjI1NTcgOS41NDE1IDMzLjg5NTIgMTAuMjIyMUMzMy41MzQ2IDEwLjkwMjggMzMuMzU0MyAxMS42NDU3IDMzLjM1NDMgMTIuNDUwOUMzMy4zNTQzIDEzLjI4MDkgMzMuNTM4NyAxNC4wMzYzIDMzLjkwNzQgMTQuNzE2OUMzNC4yNzYyIDE1LjM4OTMgMzQuNzcyIDE1LjkyNDYgMzUuMzk0OCAxNi4zMjMxQzM2LjAxNzYgMTYuNzEzMiAzNi42OTc4IDE2LjkwODMgMzcuNDM1MyAxNi45MDgzWiIgZmlsbD0iI0UzOEU5RiIvPgo8cGF0aCBkPSJNNDUuNjE1MyAxOC42NzYzVjYuMjI1NDNINDcuNjgwNFY3Ljc4MTc4QzQ4LjExNDcgNy4yMDA3NCA0OC42NTk3IDYuNzQwMDYgNDkuMzE1MiA2LjM5OTc0QzQ5Ljk3OSA2LjA1MTExIDUwLjcwMDIgNS44NzY4IDUxLjQ3ODcgNS44NzY4QzUyLjM4ODMgNS44NzY4IDUzLjIyIDYuMTAwOTIgNTMuOTc0IDYuNTQ5MTVDNTQuNzI3OSA2Ljk5NzM4IDU1LjMyMiA3LjU5MDg3IDU1Ljc1NjMgOC4zMjk2MkM1Ni4xOTA2IDcuNTkwODcgNTYuNzgwNyA2Ljk5NzM4IDU3LjUyNjQgNi41NDkxNUM1OC4yODAzIDYuMTAwOTIgNTkuMTA4IDUuODc2OCA2MC4wMDk0IDUuODc2OEM2MC45MzU0IDUuODc2OCA2MS43NzU0IDYuMTA1MDcgNjIuNTI5MyA2LjU2MTZDNjMuMjgzMiA3LjAwOTgzIDYzLjg4MTQgNy42MTU3NyA2NC4zMjM5IDguMzc5NDJDNjQuNzc0NiA5LjE0MzA3IDY1IDkuOTkzODggNjUgMTAuOTMxOFYxOC42NzYzSDYyLjkzNDlWMTEuNDI5OUM2Mi45MzQ5IDEwLjgxNTYgNjIuNzg3NCAxMC4yNDcxIDYyLjQ5MjQgOS43MjQxMUM2Mi4xOTc0IDkuMjAxMTggNjEuOCA4Ljc4MiA2MS4zMDAxIDguNDY2NThDNjAuODAwMiA4LjE1MTE2IDYwLjI0NyA3Ljk5MzQ1IDU5LjY0MDYgNy45OTM0NUM1OS4wMzQyIDcuOTkzNDUgNTguNDgxMSA4LjE0Mjg2IDU3Ljk4MTIgOC40NDE2OEM1Ny40ODEzIDguNzMyMiA1Ny4wODM5IDkuMTM4OTIgNTYuNzg4OSA5LjY2MTg2QzU2LjQ5MzkgMTAuMTc2NSA1Ni4zNDYzIDEwLjc2NTggNTYuMzQ2MyAxMS40Mjk5VjE4LjY3NjNINTQuMjgxM1YxMS40Mjk5QzU0LjI4MTMgMTAuNzY1OCA1NC4xMzM4IDEwLjE3NjUgNTMuODM4NyA5LjY2MTg2QzUzLjU0MzcgOS4xMzg5MiA1My4xNDIyIDguNzMyMiA1Mi42MzQxIDguNDQxNjhDNTIuMTM0MiA4LjE0Mjg2IDUxLjU4MTEgNy45OTM0NSA1MC45NzQ3IDcuOTkzNDVDNTAuMzc2NSA3Ljk5MzQ1IDQ5LjgyMzMgOC4xNTExNiA0OS4zMTUyIDguNDY2NThDNDguODE1NCA4Ljc4MiA0OC40MTc5IDkuMjAxMTggNDguMTIyOSA5LjcyNDExQzQ3LjgyNzkgMTAuMjQ3MSA0Ny42ODA0IDEwLjgxNTYgNDcuNjgwNCAxMS40Mjk5VjE4LjY3NjNINDUuNjE1M1oiIGZpbGw9IiNFMzhFOUYiLz4KPC9zdmc+Cg==";

const CATEGORIES = [
  { label: "Уход за кожей", href: "/skin-care/" },
  { label: "Уход за волосами", href: "/hair-care/" },
  { label: "Косметика", href: "/cosmetics/" },
];

export const bloom: Mirror = {
  refUrl: `${SITE}/`,
  liveCss: "https://f7593c5f8f8f.merfy.ru/_astro/_slug_.BCulF5DE.css",
  assetBase: "https://f7593c5f8f8f.merfy.ru/",
  catalog: { products, collections: [], publications: [] },
  known: [
    {
      section: "header",
      reason:
        "Набор иконок шапки — наш канон: поиск справа рядом с корзиной (владелец 21.09 «не должно быть поиска слева»), сердце избранного, на телефоне поиск и профиль в строке. У верстальщиков поиск слева, на телефоне только корзина — отсюда отступ слева и ширина ряда иконок.",
    },
    {
      section: "trending",
      reason:
        "Под ценой у двух товаров верстальщиков ряд вариантов (объёмы у «Маски», цвета у «Блеска») +14/+10 к строке карточек; наша карточка варианты под ценой не рисует. Это поведение карточки, не стиль: −24 к высоте на 768 и шире.",
    },
    {
      section: "philosophy",
      reason:
        "Текст у верстальщиков капсом (uppercase) — он шире и переносится на 1–3 строки больше. Капс владелец убрал 13.09, не переносим: 390–1280 ниже на 36–72.",
    },
    {
      section: "benefits",
      reason:
        "У верстальщиков иконка 44×44, у «Мультиколонн» картинка колонки — фото во всю ширину карточки (поля «Размер»/«Соотношение» меняют только пропорцию и половину ширины). Иконочного размера у секции нет.",
    },
    {
      section: "footer",
      reason:
        "Ссылки «Информации» у нас отдельной колонкой (решение владельца: колонки на одной линии), у верстальщиков — в правовой строке; на 390/768/1024/1536 отсюда разница высоты. Полоса «Разработано на Merfy» у нас ссылка кеглем 16 (как их текст 16) — замер считает ссылку кнопкой: «кегль кнопки 14 → 16».",
    },
  ],
  sections: [
    {
      name: "header",
      blocks: ["PromoBanner", "Header"],
      refIndex: 0,
      props: {
        PromoBanner: {
          id: "PromoBanner-1",
          colorScheme: "scheme-2",
          text: "Акция на новую коллекцию.",
          link: { text: "Узнать больше", href: "/about/" },
        },
        Header: {
          id: "Header-1",
          colorScheme: "scheme-3",
          siteTitle: "Bloom",
          logo: LOGO,
          navigationLinks: [
            { label: "Каталог", href: "/catalog/" },
            ...CATEGORIES,
            { label: "О нас", href: "/about/" },
          ],
        },
      },
    },
    {
      name: "hero",
      blocks: ["Hero"],
      refIndex: 1,
      props: {
        Hero: {
          id: "Hero-1",
          colorScheme: "scheme-3",
          heading: { text: "Искусство заботы о себе" },
          text: { content: "Уходовая косметика, которая дарит здоровье и сияние вашей коже и волосам" },
          primaryButton: { text: "Начать ритуал", link: { href: "/catalog" } },
          backgroundImages: { url1: `${IMG}/hero-photo.webp` },
        },
      },
    },
    {
      name: "trending",
      blocks: ["PopularProducts"],
      refIndex: 2,
      props: {
        PopularProducts: {
          id: "PopularProducts-1",
          colorScheme: "scheme-3",
          heading: "Сейчас в тренде",
          cards: 6,
          columns: 3,
          // Кнопки «Смотреть все товары» у верстальщиков нет — «глаз» на ней.
          hiddenFields: ["viewAll"],
        },
      },
    },
    {
      name: "philosophy",
      blocks: ["MainText"],
      refIndex: 3,
      props: {
        MainText: {
          id: "MainText-1",
          colorScheme: "scheme-2",
          // Заголовка у верстальщиков нет — «глаз» на заголовке.
          hiddenFields: ["heading"],
          text: {
            content:
              "Уход за кожей и самочувствием для динамичной жизни. Мы сочетаем активные ингредиенты из моря и гор с научными знаниями о коже и опьяняющими ароматами, создавая чувственный опыт, который успокаивает и восстанавливает кожу.",
          },
          button: { text: "Подробнее", link: "/about/" },
        },
      },
    },
    {
      name: "gallery",
      blocks: ["Gallery"],
      refIndex: 4,
      props: {
        Gallery: {
          id: "Gallery-1",
          colorScheme: "scheme-3",
          // Заголовок «Галерея» у верстальщиков только для скринридера.
          hiddenFields: ["heading"],
          items: [
            { id: "item-1", type: "image", url: `${IMG}/balaklava.webp`, alt: "Галерея" },
            { id: "item-2", type: "product", productId: "bag-4" },
          ],
        },
      },
    },
    {
      name: "benefits",
      blocks: ["MultiColumns"],
      refIndex: 5,
      props: {
        MultiColumns: {
          id: "MultiColumns-1",
          colorScheme: "scheme-2",
          // Заголовка у верстальщиков нет — «глаз» на заголовке.
          hiddenFields: ["heading"],
          textPosition: "center",
          // Белые карточки на розовом — «Контейнер» со своей схемой.
          containerEnabled: "true",
          containerColorScheme: "scheme-3",
          columns: BENEFITS.map((b, i) => ({
            id: `col-${i + 1}`,
            image: `${SITE}/icons/benefit-${i + 1}.webp`,
            title: b.title,
            description: b.description,
          })),
        },
      },
    },
    {
      name: "footer",
      blocks: ["Footer"],
      refIndex: 6,
      props: {
        Footer: {
          id: "Footer-1",
          colorScheme: "scheme-3",
          siteTitle: "Bloom",
          logo: LOGO,
          heading: { text: "Подпишитесь на рассылку" },
          text: { content: "Подпишитесь на наши акции и новости" },
          phone: "+7 (000) 000-00-00",
          navigationColumn: {
            links: [...CATEGORIES, { label: "О нас", href: "/about/" }, { label: "Контакты", href: "/contacts/" }],
          },
          informationColumn: {
            links: [
              { label: "Политика доставки", href: "/legal/delivery/" },
              { label: "Политика возврата", href: "/legal/return/" },
              { label: "Условия обслуживания", href: "/legal/terms/" },
              { label: "Политика конфиденциальности", href: "/legal/privacy/" },
            ],
          },
          socialColumn: {
            email: "example@bloom.ru",
            contactFields: [{ label: "Адрес", value: "г. Москва, ул. Пушкина, д. 0" }],
            socialLinks: [
              { platform: "vk", href: "https://vk.com/" },
              { platform: "youtube", href: "https://youtube.com/" },
              { platform: "dzen", href: "https://dzen.ru/" },
              { platform: "tiktok", href: "https://tiktok.com/" },
              { platform: "telegram", href: "https://t.me/" },
            ],
          },
          copyright: "© 2026 Bloom Theme Все права защищены.",
        },
      },
    },
  ],
};
