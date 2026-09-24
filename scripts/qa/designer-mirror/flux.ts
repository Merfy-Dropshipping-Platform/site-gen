import type { Mirror } from "./index";

/**
 * Главная flux.merfy.ru (flux-theme @be32556d, src/pages/index.astro):
 * промо+шапка → Hero → Collections → FeaturedProduct → Popular → CTA (Puk) →
 * Gallery → подвал (рассылка внутри подвала).
 *
 * Товары у flux приходят HTTP-запросом во фронтматтере (storefront-data), а не
 * из `catalog`: в рендере зеркала их подставляет заглушка
 * scripts/qa/product-six-images-stub.mjs (4 товара), поэтому `catalog` пуст,
 * как у bloom.
 */
const IMG = "https://flux.merfy.ru/images/4x";

/**
 * Живая витрина flux подключает шрифты НЕ из своего CSS, а двумя <link> на
 * Google Fonts в <head> (Roboto Flex/Inter/Manrope). designer-goal.ts кладёт в
 * страницу только текст `liveCss`, поэтому без этих ссылок наша сторона
 * рисовалась системным шрифтом и ширины текста не совпадали с витриной.
 * `liveCss` здесь — тот же набор, что грузит стенд: CSS витрины + обе ссылки
 * шрифтов, собранные в одну таблицу через @import (data:-адрес читает fetch).
 */
const STAND = "https://u9fpo33bkmsd.merfy.ru/";
const STAND_CSS = `${STAND}_astro/_slug_.BRJH5LzI.css`;
const STAND_FONTS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400&family=Manrope:wght@300;400;500;600;700&family=Roboto+Flex:opsz,wght@8..144,300;8..144,400;8..144,500;8..144,600;8..144,700&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100;200;300;400;500;600;700;800;900;1000&display=swap",
];
const liveCssWithFonts = `data:text/css,${encodeURIComponent(
  [...STAND_FONTS, STAND_CSS].map((u) => `@import url("${u}");`).join("\n"),
)}`;

/** Клетка, которую не закрыть без нарушения правил брифа — решает владелец. */
type Known = { section: string; reason: string };

export const flux: Mirror & { known: Known[] } = {
  known: [
    {
      section: "header",
      reason:
        "≥1024: иконки действий 24px вместо 32px у верстальщиков — решение владельца 20.09 («иконки большие», сторож flux-header-icon-size.spec.ts), правый край на 4px левее. 390: у верстальщиков в замер попадает кнопка «Найти» (14px) из свёрнутой панели поиска (max-height:0), у нас такой нет — промо у обоих 12px.",
    },
    {
      section: "hero",
      reason:
        "Капс заголовка/подзаголовка у верстальщиков (владелец убрал 13.09) — строки шире на ~30px; и позиция по умолчанию у нас «center-left» (theme.json blockDefaults.Hero.position), у верстальщиков текст по центру. Сменить дефолт позиции — решение владельца.",
    },
    {
      section: "product",
      reason:
        "Макет по умолчанию у нас «Сложенный» (сетка миниатюр 2×N: theme.json blockDefaults.Product.layout + дефолт панели, сторож 13.09), у верстальщиков — ряд миниатюр (наш «Карусель»); с layout=carousel совпадает всё, кроме числа фото (у заглушки 6, у них 5). Аккордеон «Описание» снят по замечанию тестировщика 14.09 и выключен дефолтом темы.",
    },
    {
      section: "popular",
      reason:
        "Ряд цветовых образцов в карточке (20px + зазор 16) у верстальщиков — это данные товара (варианты цвета); у товаров заглушки storefront-data вариантов нет. Остальная геометрия совпадает.",
    },
    {
      section: "cta",
      reason:
        "≥1536: витрина грузит второй Roboto Flex без оси opsz (src/generator/constructor-theme-bridge.ts googleFontsHref, общий код) — буквы шире, абзац переносится на вторую строку (+24px). С одним шрифтом верстальщиков (opsz) клетка зелёная — проверено.",
    },
    {
      section: "gallery",
      reason:
        "В плитке товара у верстальщиков кнопка «В корзину» (48px + зазор 24) — элемента у нашей секции нет, ряд ниже на 72px, отсюда и пропорция большого фото. 390: подпись коллекции у нас <h3>, у них <span> в ссылке — роль «кнопка» в замере.",
    },
    {
      section: "footer",
      reason:
        "Заголовки колонок «Навигация / Информация / Социальные сети» — канон нашей секции (у верстальщиков их нет). Кегль рассылки задаёт панель: по умолчанию «Маленький» (Footer.puckConfig heading/text size small = 16/18 и 12/14), у верстальщиков 18/20 и 14/16 = наш «Средний».",
    },
  ],
  refUrl: "https://flux.merfy.ru/",
  liveCss: liveCssWithFonts,
  assetBase: STAND,
  catalog: { products: [], collections: [], publications: [] },
  sections: [
    {
      name: "header",
      blocks: ["PromoBanner", "Header"],
      refIndex: 0,
      props: {
        PromoBanner: {
          id: "PromoBanner-1",
          text: "Бесплатная доставка на весь ассортимент до 31.12.2026.",
          link: { text: "Смотреть больше", href: "/catalog/" },
        },
        Header: {
          id: "Header-1",
          siteTitle: "Flux",
          navigationLinks: [
            { label: "Главная", href: "/" },
            { label: "Полноразмерные наушники", href: "/catalog/naushniki/" },
            { label: "TWS-наушники с кейсом", href: "/catalog/tws/" },
            { label: "Портативные колонки", href: "/catalog/kolonki/" },
            { label: "Саундбары", href: "/catalog/saundbary/" },
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
          heading: { text: "Технологии без паузы" },
          text: { content: "Будущее — в режиме онлайн.\nВаш новый гаджет — уже в наличии." },
          primaryButton: { text: "Новинки 2026", link: { href: "/catalog/" } },
          backgroundImages: { url1: `${IMG}/hero-headphones.jpg` },
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
          heading: { text: "Категории" },
          collections: [
            { heading: "Полноразмерные наушники", image: `${IMG}/headphones-silver-studio.jpg` },
            { heading: "TWS-наушники с кейсом", image: `${IMG}/tws-white-2.jpg` },
            { heading: "Портативные колонки", image: `${IMG}/speaker-graphite.jpg` },
          ],
        },
      },
    },
    {
      name: "product",
      blocks: ["Product"],
      refIndex: 3,
      // Товар заглушки p1 — 6 фото, как у верстальщиков (главное + 5 миниатюр).
      props: {
        Product: {
          id: "Product-1",
          productId: "p1",
          text: { content: "Полноразмерные наушники" },
        },
      },
    },
    {
      name: "popular",
      blocks: ["PopularProducts"],
      refIndex: 4,
      props: {
        PopularProducts: {
          id: "PopularProducts-1",
          heading: { text: "Бестселлеры" },
          viewAll: { text: "Смотреть ещё", href: "/catalog/" },
          // У верстальщиков — 4 настоящих товара (карточки с кнопкой «В
          // корзину»). Коллекция заглушки col-1 даёт 4 товара; без выбранной
          // коллекции наша секция рисует плейсхолдеры без кнопки.
          collection: "col-1",
        },
      },
    },
    {
      name: "cta",
      blocks: ["MainText"],
      refIndex: 5,
      props: {
        MainText: {
          id: "MainText-1",
          heading: { text: "Следующее поколение уже с вами!" },
          text: {
            content:
              "Они здесь. Устройства, которые изменят завтра, уже сегодня в нашем потоке новинок. Смотрите, тестируйте, погружайтесь в будущее, которое стало реальностью. Только в Flux.",
          },
          button: { text: "Смотреть новинки", link: { href: "/catalog/" } },
        },
      },
    },
    {
      name: "gallery",
      blocks: ["Gallery"],
      refIndex: 6,
      props: {
        Gallery: {
          id: "Gallery-1",
          // Заголовка у верстальщиков нет — «глаз» панели.
          hiddenFields: ["heading"],
          items: [
            { type: "image", url: `${IMG}/gallery-tws-lifestyle.jpg`, alt: "TWS-наушники с кейсом" },
            { type: "product", productId: "p1" },
            { type: "collection", collectionId: "col-1" },
          ],
        },
      },
    },
    {
      name: "footer",
      blocks: ["Footer"],
      refIndex: 7,
      props: {
        Footer: {
          id: "Footer-1",
          newsletter: {
            enabled: true,
            heading: "Подпишитесь на нашу рассылку",
            description: "Введите электронную почту и получайте информацию о нашем бренде",
            placeholder: "flux@example.ru",
          },
          navigationColumn: {
            links: [
              { label: "Полноразмерные наушники", href: "/catalog/naushniki/" },
              { label: "TWS-наушники с кейсом", href: "/catalog/tws/" },
              { label: "Портативные колонки", href: "/catalog/kolonki/" },
              { label: "Саундбары", href: "/catalog/saundbary/" },
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
          phone: "+7 (000) 000-00-00",
          socialColumn: {
            email: "example@flux.merfy",
            socialLinks: [
              { platform: "vk", href: "https://vk.com/" },
              { platform: "youtube", href: "https://youtube.com/" },
              { platform: "dzen", href: "https://dzen.ru/" },
              { platform: "tiktok", href: "https://tiktok.com/" },
              { platform: "telegram", href: "https://t.me/" },
            ],
          },
          paymentEnabled: true,
        },
      },
    },
  ],
};
