import type { Mirror } from "./index";

/**
 * Главная vanilla.merfy.ru (Vanilla-theme @c65d9e1c, src/pages/index.astro):
 * Header (промо + шапка) → Hero (карусель из трёх слайдов с полосой «← 1 2 3 →»)
 * → Collections → Gallery (промо-текст + видео + «Ваш дом — наша забота») →
 * Popular → FooterNewsletter → Footer.
 *
 * Пары с нашими секциями:
 *  - их Hero — карусель; у нас карусель — это секция «Слайд-шоу» (Slideshow),
 *    а «Изображение» (Hero) по решению владельца всегда одно полотно без
 *    полосы переключения. Тем же содержимым (три слайда) их первый экран
 *    рисует только Slideshow.
 *  - их Gallery — три полосы подряд; у нас это MainText + Video + ImageWithText
 *    (тот же состав, что в сиде главной темы, pages/home.json).
 */
const IMG = "https://vanilla.merfy.ru/images";

const products = [
  { id: "dekorativnye-podushki", name: "Подушки декоративные комплект 2 шт.", price: 1940, old: 2290, img: "vanilla-product-1.webp" },
  { id: "vaza-vanilla", name: "Ваза Vanilla", price: 1490, img: "vanilla-product-2.webp" },
  { id: "sherstyanoe-pokryvalo", name: "Покрывало шерстяное", price: 2940, img: "vanilla-textile-2.webp" },
  { id: "myagkiy-pled", name: "Мягкий плед", price: 2940, img: "vanilla-textile-3.webp" },
  { id: "komplekt-postelnogo-belya", name: "Комплект постельного белья", price: 2940, img: "vanilla-textile-4.webp" },
  { id: "kashpo", name: "Кашпо для растений", price: 1290, img: "vanilla-decor-2.webp" },
].map((p) => ({
  id: p.id,
  name: p.name,
  title: p.name,
  slug: p.id,
  handle: p.id,
  image: `${IMG}/${p.img}`,
  images: [`${IMG}/${p.img}`],
  price: p.price,
  basePrice: p.price,
  ...(p.old ? { compareAtPrice: p.old } : {}),
  collectionIds: ["popular"],
}));

const collections = [
  { id: "textile", name: "Текстиль и постельные принадлежности", slug: "textile", image: `${IMG}/vanilla-collection-textile.webp`, images: [], productIds: [] },
  { id: "decor", name: "Декор и предметы интерьера", slug: "decor", image: `${IMG}/vanilla-collection-decor.webp`, images: [], productIds: [] },
  { id: "popular", name: "Популярные товары", slug: "popular", image: "", images: [], productIds: products.map((p) => p.id) },
];

/**
 * Живой CSS витрины + шрифты Google, которые витрина vanilla подключает
 * ОТДЕЛЬНЫМ <link> в <head> (Arsenal/Bitter). Цель кладёт в страницу только
 * текст liveCss, поэтому без шрифтов наша сторона рисовалась системным
 * шрифтом и переносила строки иначе. Адрес data: читается fetch-ем как
 * обычный CSS; @import-ы стоят в самом начале первого <style> страницы.
 */
const LIVE_CSS = `data:text/css,${encodeURIComponent(
  [
    '@import url("https://fonts.googleapis.com/css2?family=Arsenal:ital,wght@0,400;0,700;1,400&family=Bitter:ital,wght@0,400;1,400&display=swap");',
    '@import url("https://5c178ceecc1d.merfy.ru/_astro/_slug_.DK4p7PaI.css");',
  ].join("\n"),
)}`;

const SUBTITLE =
  "Вдохновение для каждого дня — актуальные коллекции текстиля и декора, созданные, чтобы радовать и удивлять.";

export const vanilla: Mirror = {
  refUrl: "https://vanilla.merfy.ru/",
  liveCss: LIVE_CSS,
  assetBase: "https://5c178ceecc1d.merfy.ru/",
  catalog: { products, collections, publications: [] },
  known: [
    {
      section: "header",
      reason:
        "390: мобильная шапка у нас по канону несёт четыре значка (поиск, избранное, корзина, профиль) и логотип в потоке; у верстальщиков — бургер, логотип по центру и одна корзина. Правый край — кнопка профиля (374 против 361).",
    },
    {
      section: "gallery",
      reason:
        "390/768: у верстальщиков текст «Ваш дом — наша забота» — два абзаца с зазором 16px, у нас поле «Текст» секции «Изображение с текстом» держит один абзац (внутренние <p> экранируются) — на узких экранах на ~33px ниже.",
    },
    {
      section: "popular",
      reason:
        "Все ширины: под сеткой у нас кнопка «Смотреть все товары» (+80px: h-12 + зазор 32) — часть канона секции (Figma 1-33175), поле скрыто из панели, отключить нечем. На 768/1024 ещё −16px: у верстальщиков капс переносит «Комплект постельного белья» на две строки, капс мы не переносим (владелец 13.09).",
    },
    {
      section: "footer",
      reason:
        "390: нижняя полоса у нас по канону «Разработано на Merfy», у верстальщиков — «© 2026 Vanilla. Все права защищены. Powered by Merfy»; разница ширины — длина этой строки (поле скрыто из панели).",
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
          text: "Бесплатная доставка на весь ассортимент",
          link: { href: "/catalog/textile/" },
        },
        Header: {
          id: "Header-1",
          navigationLinks: [
            { label: "Текстиль", href: "/catalog/textile/" },
            { label: "Декор", href: "/catalog/decor/" },
            { label: "История", href: "/about/" },
          ],
        },
      },
    },
    {
      name: "hero",
      blocks: ["Slideshow"],
      refIndex: 1,
      props: {
        Slideshow: {
          id: "Slideshow-1",
          slides: [
            {
              image: `${IMG}/vanilla-hero-slide-1.webp`,
              heading: { text: "Искусство жить уютно" },
              text: { content: "Товары, которые делают дом особенным" },
              button: { text: "Перейти к коллекции", link: "#collections" },
            },
            {
              image: `${IMG}/vanilla-hero-slide-2.webp`,
              heading: { text: "Дом, в который хочется возвращаться" },
              text: { content: "Товары, создающие атмосферу тепла и спокойствия" },
              button: { text: "Перейти к товарам", link: "/catalog/textile/" },
            },
            {
              image: `${IMG}/vanilla-hero-slide-3.webp`,
              heading: { text: "Интерьер, наполненный смыслом" },
              text: { content: "коллекция текстиля и декора для тех, кто ценит красоту в деталях" },
              button: { text: "Новые поступления", link: "/catalog/textile/" },
            },
          ],
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
          subtitle: SUBTITLE,
          collections: [
            { id: "c1", collectionId: "textile" },
            { id: "c2", collectionId: "decor" },
          ],
        },
      },
    },
    {
      name: "gallery",
      blocks: ["MainText", "Video", "ImageWithText"],
      refIndex: 3,
      props: {
        MainText: {
          id: "MainText-1",
          heading: { text: "Тепло вашего дома начинается здесь" },
          text: {
            content:
              "Потому что настоящий уют рождается из деталей. Мы знаем, как важно возвращаться в дом, где каждая деталь дарит комфорт и радость. Натуральный хлопок, уютный велюр, мягкий лен и нежные оттенки — все это Vanilla. Позвольте себе наслаждаться красотой в деталях и превратите повседневность в маленькое удовольствие. Создайте дом своей мечты вместе с Vanilla.",
          },
          button: { text: "К покупкам", link: "/catalog/textile/" },
        },
        Video: {
          id: "Video-1",
          poster: `${IMG}/Video.webp`,
        },
        ImageWithText: {
          id: "ImageWithText-1",
          image: { url: `${IMG}/vanilla-chair.webp`, alt: "Стул Vanilla" },
          heading: { text: "Ваш дом — наша забота" },
          text: {
            // У верстальщиков два абзаца; поле «Текст» держит один (внутренние <p> экранируются).
            content:
              "Мы уверены: дом должен быть красивым не только на фотографиях, но и на ощупь. Бренд Vanilla создан для тех, кто ценит эстетику и качество в каждом квадратном метре своего пространства. Мы собираем для вас самые вдохновляющие предметы текстиля и декора, чтобы ваш интерьер обрел индивидуальность. В ассортименте Vanilla вы не найдете случайных вещей. Только то, что действительно достойно стать частью вашего дома",
          },
          button: { text: "Смотреть больше", link: "/about/" },
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
          heading: { text: "Популярные товары" },
          text: { content: SUBTITLE },
          collection: "popular",
          cards: 6,
          // Три колонки — как у верстальщиков. Своё значение по умолчанию тема
          // задать не может: общий адаптер ревизий ставит columns=4 раньше
          // blockDefaults (src/themes/page-blocks.ts, coercePopularProductsProps).
          columns: 3,
          // У верстальщиков под каждой карточкой кнопка «В корзину».
          quickAddMode: "standard",
        },
      },
    },
    {
      name: "newsletter",
      blocks: ["Newsletter"],
      refIndex: 5,
      props: {
        Newsletter: {
          id: "Newsletter-1",
          heading: { text: "Будьте в курсе уютных новостей" },
          text: {
            content:
              "Станьте частью сообщества Vanilla. Вас ждут свежие идеи для уюта, анонсы новинок, полезные советы по уходу за текстилем и специальные промокоды для подписчиков.",
          },
          placeholder: "E-mail",
          buttonText: "Отправить",
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
          // Данные магазина, которые сборка кладёт в подвал сама (utils/footer-data.ts):
          // телефон из «Информации о компании» и значки оплаты при подключённой кассе.
          phone: "+7 (000) 000-00-00",
          paymentEnabled: true,
          navigationColumn: {
            title: "",
            links: [
              { label: "Текстиль", href: "/catalog/textile/" },
              { label: "Декор", href: "/catalog/decor/" },
              { label: "Домашняя одежда", href: "/catalog/textile/" },
              { label: "История", href: "/about/" },
              { label: "Контакты", href: "/contacts/" },
            ],
          },
          informationColumn: {
            title: "",
            links: [
              { label: "Политика доставки", href: "/legal/delivery/" },
              { label: "Политика возврата", href: "/legal/return/" },
              { label: "Условия обслуживания", href: "/legal/terms/" },
              { label: "Политика конфиденциальности", href: "/legal/privacy/" },
            ],
          },
          socialColumn: {
            title: "",
            email: "example@vanilla.merfy",
            // У верстальщиков ссылки «#»; наш подвал такие не рисует, поэтому адреса живые.
            socialLinks: [
              { platform: "telegram", href: "https://t.me/vanilla" },
              { platform: "vk", href: "https://vk.com/vanilla" },
              { platform: "tiktok", href: "https://tiktok.com/@vanilla" },
              { platform: "youtube", href: "https://youtube.com/@vanilla" },
              { platform: "dzen", href: "https://dzen.ru/vanilla" },
            ],
          },
        },
      },
    },
  ],
};
