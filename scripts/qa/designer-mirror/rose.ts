import type { Mirror } from "./index";

/**
 * Главная rose.merfy.ru (Rose-theme @b719c193, src/pages/index.astro):
 * промо + шапка, первый экран, «Коллекции», «Главные хиты» (4 товара),
 * «Снова в наличии!» (галерея из трёх плиток), подвал с рассылкой.
 */
const IMG = (name: string) => `https://rose.merfy.ru/images/${encodeURIComponent(name)}`;

const product = (id: string, name: string, image: string, price: number, compareAtPrice: number | null) => ({
  id,
  name,
  slug: id,
  image: IMG(image),
  images: [IMG(image)],
  price,
  compareAtPrice,
  collectionIds: ["hits"],
});

const collection = (id: string, name: string, image: string, productIds: string[] = []) => ({
  id,
  name,
  slug: id,
  image: IMG(image),
  images: [IMG(image)],
  productIds,
});

/**
 * Живой CSS витрины rose (стенда нет — магазин 9c1c6fa8be34) ПЛЮС шрифты темы.
 * Comfortaa/Manrope витрина грузит не из `_astro/*.css`, а строкой `@import`
 * в своём `__merfy_tokens_css`; цель собирает токены из пустых настроек, и без
 * этой строки наша сторона рисовалась системным шрифтом — ширины строк и высоты
 * секций расходились с витриной, а не с вёрсткой. Оба файла подключаются
 * `@import` — тем же порядком, что на витрине.
 */
const LIVE_CSS = [
  '@import url("https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=Manrope:wght@200;300;400;500;600;700;800&display=swap");',
  '@import url("https://9c1c6fa8be34.merfy.ru/_astro/_slug_.siLGM0gk.css");',
].join("\n");

/**
 * Клетки, которые не закрыть без нарушения правил брифа (стили под признаком,
 * без смены состава секций и настроек). Остаются красными; решает владелец.
 */
type Known = { section: string; widths?: number[]; reason: string };

export const rose: Mirror & { known: Known[] } = {
  refUrl: "https://rose.merfy.ru/",
  liveCss: `data:text/css;charset=utf-8,${encodeURIComponent(LIVE_CSS)}`,
  assetBase: "https://9c1c6fa8be34.merfy.ru/",
  catalog: {
    products: [
      product("bag-1", "КЛАТЧ MILA", "Товар_1.jpg", 3990, 5990),
      product("bag-2", "БАГЕТ SIENNA", "Товар_2.jpg", 5490, null),
      product("bag-3", "СУМКА BIANCA", "Товар_3.jpg", 3990, null),
      product("bag-4", "СУМКА STELLA", "Товар_4.jpg", 5990, 7990),
      { ...product("bag-5", "Сумка", "Товар_5__2_.jpg", 5990, null), collectionIds: [] },
    ],
    collections: [
      collection("riviera", "Коллекция RIVIERA", "Коллекция_1.jpg"),
      collection("urban", "Коллекция URBAN", "Коллекция_2.jpg"),
      collection("futurism", "Коллекция FUTURISM", "Коллекция_3.jpg"),
      collection("hits", "Главные хиты", "Товар_1.jpg", ["bag-1", "bag-2", "bag-3", "bag-4"]),
    ],
    publications: [],
  },
  known: [
    {
      section: "header",
      widths: [1920, 2560],
      reason:
        "Шапка у нас стоит на рельсе секций 1320px (баг тестировщика 14.09: на широких экранах она выходила за секции). У верстальщиков рельса нет — содержимое 1360px, отступ 280 вместо 300.",
    },
    {
      section: "collections",
      widths: [390],
      reason:
        "У верстальщиков заголовок капсом и на телефоне переносится на вторую строку (+14px). Капс снят владельцем 13.09 — у нас одна строка.",
    },
    {
      section: "popular",
      reason:
        "Состав карточки: у верстальщиков под каждой карточкой всегда видна кнопка «В корзину» (+52px), у нас «Быстрое добавление» по умолчанию выключено; зато у нас под сеткой кнопка «Смотреть все товары» (канон viewAll, её кегль 16 и даёт «кегль кнопки»). На 768/1024 ещё и колонки: «Колонки» = 4 с планшета (живая нормализация всегда дописывает columns=4), у верстальщиков 3 до 1280. Пропорции фото и кегли карточки совпадают.",
    },
    {
      section: "gallery",
      reason:
        "Плитка коллекции рисуется без <img>: у типа «коллекция» в SSR нет картинки, а гидрация только меняет src у существующего <img> — поэтому у нас 2 фото из 3. Это баг данных (на витрине плитка коллекции тоже остаётся пустой), не стиль. Геометрия галереи совпадает на всех ширинах.",
    },
    {
      section: "footer",
      widths: [390],
      reason:
        "Нижняя полоса: у верстальщиков текст «© … Powered by Merfy» (p, 14px), у нас ссылка «Разработано на Merfy» (решение владельца 20.09) — инструмент считает её кнопкой, и «кегль текста» берёт подзаголовок 12px. Размер полосы и текста тот же, 14px.",
    },
    {
      section: "footer",
      widths: [768],
      reason: "У верстальщиков на планшете в навигации подвала есть лишняя ссылка «Войти в аккаунт» (+38px). У нас её нет — состав колонки задаёт мерчант.",
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
          text: "Скидка 10% на общую сумму заказа от 9 000₽",
          link: { text: "Перейти", href: "/catalog/" },
        },
        Header: {
          id: "Header-1",
          siteTitle: "Rose",
          navigationLinks: [
            { label: "Главная", href: "/" },
            { label: "Каталог", href: "/catalog/" },
            { label: "Контакты", href: "/contacts/" },
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
          heading: { text: "Rose" },
          text: { content: "Там, где классика встречается с характером" },
          primaryButton: { text: "В каталог", link: { href: "/catalog/" } },
          backgroundImages: { url1: IMG("Главный_экран.jpg") },
        },
      },
    },
    {
      name: "collections",
      blocks: ["Collections"],
      refIndex: 2,
      props: {
        Collections: {
          id: "Collections-1",
          heading: "Коллекции, которые становятся любимыми",
          subtitle: "Вдохновение для каждого дня — актуальные коллекции сумок, созданные, чтобы радовать и удивлять.",
          collections: [{ collectionId: "riviera" }, { collectionId: "urban" }, { collectionId: "futurism" }],
        },
      },
    },
    {
      name: "popular",
      blocks: ["PopularProducts"],
      refIndex: 3,
      props: {
        PopularProducts: {
          id: "PopularProducts-1",
          heading: "Главные хиты",
          text: "Найдите стиль на каждый случай — коллекции, которые помогают выразить себя вне времени и трендов.",
          collection: "hits",
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
          heading: "Снова в наличии!",
          text: "Сравнивайте, находите своё — от культовых моделей до свежих решений для особенных моментов",
          items: [
            { id: "item-1", type: "image", url: IMG("Изображение_Галерея.jpg"), alt: "Галерея" },
            { id: "item-2", type: "product", productId: "bag-5" },
            { id: "item-3", type: "collection", collectionId: "futurism" },
          ],
        },
      },
    },
    {
      name: "footer",
      blocks: ["Footer"],
      refIndex: 5,
      props: {
        Footer: {
          id: "Footer-1",
          siteTitle: "Rose",
          heading: { text: "Подпишитесь на нашу рассылку" },
          text: { content: "Получайте информацию от нашего бренда" },
          newsletter: { enabled: true, placeholder: "example@rose.merfy" },
          navigationColumn: {
            links: [
              { label: "Главная", href: "/" },
              { label: "Каталог", href: "/catalog/" },
              { label: "Контакты", href: "/contacts/" },
            ],
          },
          informationColumn: {
            links: [
              { label: "Политика доставки", href: "/legal/delivery/" },
              { label: "Политика возврата", href: "/legal/return/" },
              { label: "Условия обслуживания", href: "/legal/terms/" },
              { label: "Политика конфиденциальности", href: "/legal/privacy/" },
            ],
          },
          // Контакты, соцсети и кассу у живого магазина подставляет сборка из
          // «Информации о компании» — здесь они заданы, как у верстальщиков.
          phone: "+7 (000) 000-00-00",
          socialColumn: {
            email: "example@rose.merfy",
            socialLinks: [
              { platform: "telegram", href: "https://t.me/rose" },
              { platform: "vk", href: "https://vk.com/rose" },
              { platform: "tiktok", href: "https://tiktok.com/@rose" },
              { platform: "youtube", href: "https://youtube.com/@rose" },
              { platform: "dzen", href: "https://dzen.ru/rose" },
            ],
          },
          paymentEnabled: true,
        },
      },
    },
  ],
};
