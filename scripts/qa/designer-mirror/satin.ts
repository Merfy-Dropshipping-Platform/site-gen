import type { Mirror } from "./index";

/**
 * Главная satin.merfy.ru (Satin-theme @cb548963, src/pages/index.astro).
 *
 * Полосы верстальщиков по порядку (refBands):
 *  0 промо + шапка · 1 Hero · 2 Collections · 3 Popular · 4 CollectionRows ·
 *  5 TextBlock · 6 ImageBanner · 7 Collections (второй раз) · 8 Popular
 *  (второй раз) · 9 Features · 10 Journal · 11 Faq · 12 подвал.
 * Повторы (Collections, Popular) сопоставлены по порядку: первая пара — товары
 * 0–2 и коллекции 1–3, вторая — товары 3–5 и коллекции 4–6.
 *
 * Наши секции: CollectionRows → MultiRows, TextBlock → MainText,
 * ImageBanner → ImageWithText, Features → MultiColumns, Journal → Publications,
 * Faq → CollapsibleSection (так их и портировал themes/satin, см. MANNER.md).
 */
// «4» закодировано (%34): порт satin считает адреса с «/images/4x/» моком
// верстальщика и подменяет их плейсхолдером, а нам нужны их фото.
const IMG = "https://satin.merfy.ru/images/%34x";

/**
 * Живой CSS стенда satin + его шрифты. Шрифты (Arsenal, Kelly Slab) витрина
 * тянет ОТДЕЛЬНОЙ ссылкой на Google Fonts в <head>, а цель вставляет только
 * текст liveCss — без шрифтов наша сторона рисуется запасным Arial/Times и
 * ширины/высоты текста врут. Поэтому liveCss — data:-таблица из двух @import
 * в том же порядке, что на стенде.
 */
const STAND_CSS = "https://8afc7b1ed6ee.merfy.ru/_astro/_slug_.CMv62pMg.css";
const STAND_FONTS =
  "https://fonts.googleapis.com/css2?family=Arsenal:wght@400;700&family=Kelly+Slab&family=Inter:wght@300;400;500&display=swap";
const LIVE_CSS = `data:text/css,${encodeURIComponent(`@import url("${STAND_FONTS}");\n@import url("${STAND_CSS}");\n`)}`;

const product = (id: string, name: string, image: string, price: number, compareAtPrice: number | null, col: string) => ({
  id,
  name,
  slug: id,
  image: `${IMG}/${image}`,
  images: [`${IMG}/${image}`],
  price,
  compareAtPrice,
  collections: [{ id: col }],
});

const products = [
  product("jeans-w", "Джинсы женские", "Товар_1.webp", 6990, 9990, "pop-women"),
  product("sport-suit-w", "Женский спортивный костюм", "Костюм_1.webp", 8990, null, "pop-women"),
  product("jumper-w", "Джемпер женский", "Товар_3.webp", 3490, 4990, "pop-women"),
  product("jumper-m", "Джемпер мужской", "Джемпер_мужской.webp", 14990, 16490, "pop-men"),
  product("jeans-ripped-m", "Рваные джинсы мужские", "Джинсы_мужские.webp", 3490, 4990, "pop-men"),
  product("sport-suit-m", "Мужской спортивный костюм", "Костюм_мужской.webp", 8990, null, "pop-men"),
];

const collection = (id: string, name: string, image: string | null) => ({
  id,
  name,
  slug: id,
  image: image ? `${IMG}/${image}` : null,
});

const collections = [
  collection("outerwear", "Верхняя одежда", "Коллекция_1.webp"),
  collection("knitwear", "Джемперы и кардиганы", "Коллекция_2.webp"),
  collection("tops", "Футболки и топы", "Коллекция_3.webp"),
  collection("outerwear-2", "Верхняя одежда", "Коллекция_4.webp"),
  collection("knitwear-2", "Джемперы и кардиганы", "Коллекция_5.webp"),
  collection("polo-2", "Футболки и поло", "Коллекция_6.webp"),
  collection("pop-women", "Женское", null),
  collection("pop-men", "Мужское", null),
];

const publications = [
  ["j1", "Летняя коллекция уже здесь", "Лён, хлопок, свободные силуэты — 12 оттенков, которые сочетаются между собой без раздумий.", "journal-1.webp", "2026-05-01T12:41:00"],
  ["j2", "Доставка за 1 день — бесплатно", "Заказ от 5 000 ₽ по Москве — на следующий день и без доплаты. Примерка при курьере, возврат на месте.", "journal-2.webp", "2026-04-21T09:31:00"],
  ["j3", "Новая весенняя коллекция", "Тренчи, трикотаж, рубашки — остатки весенней коллекции со скидкой. До воскресенья, пока есть размеры.", "journal-3.webp", "2026-03-14T08:00:00"],
].map(([id, title, excerpt, image, publishedAt]) => ({
  id,
  title,
  slug: id,
  category: "blog",
  excerpt,
  coverImageUrl: `${IMG}/${image}`,
  publishedAt,
}));

const slot = (collectionId: string, i: number) => ({ id: `col-${i}`, collectionId });

// У верстальщиков над товарами нет заголовка, в ряд 3 карточки.
const popular = (id: string, collectionId: string) => ({
  id,
  heading: "",
  collection: collectionId,
  cards: 3,
  columns: 3,
  viewAll: { show: true, text: "Смотреть больше", href: "/catalog/" },
});

const nav = (items: [string, string][]) => items.map(([label, href]) => ({ label, href }));

/** Клетки, которые не закрыть без нарушения правил брифа, — решает владелец. */
type Known = { section: string; reason: string }[];

export const satin: Mirror & { known: Known } = {
  known: [
    {
      section: "popular",
      reason:
        "768: у верстальщиков имя товара КАПСОМ («ЖЕНСКИЙ СПОРТИВНЫЙ КОСТЮМ») не влезает в строку и переносится — карточка на 20px выше. Капс владелец убрал 13.09, строчными имя в одну строку.",
    },
    {
      section: "popular-2",
      reason: "768: то же — перенос капсового имени товара у верстальщиков (+20px).",
    },
    {
      section: "features",
      reason: "768: заголовки карточек у верстальщиков КАПСОМ переносятся на строку больше (+23px). Капс не переносим.",
    },
    {
      section: "journal",
      reason: "1024: заголовки записей журнала у верстальщиков КАПСОМ переносятся на строку больше (+19px). Капс не переносим.",
    },
    {
      section: "rows",
      reason:
        "768: у верстальщиков квадратное фото ряда растягивается по высоте текста (315) и вылезает из своей колонки 300 в зазор — их ошибка вёрстки; у нас фото держит колонку (w-full, починено 20.09 по жалобе тестера «текст наезжает на фото»). Отсюда пропорция 300×315 против 315×315.",
    },
    {
      section: "rows",
      reason:
        "Любая ширина: решение владельца 17–20.09 (f3ffa73e, ed711995, b68871f1, ebd40ea0, a01dfd7a, ae55ded6, 4287e8ae) главнее вёрстки верстальщика — ряд сплошной, фото и текст впритык (зазор пары 0, у верстальщика md:gap-10=40), у текста свои поля 32px, между рядами 32px. 24.09 (7c87010e) это временно перебивалось геометрией верстальщика под PARITY_DESIGN — регресс исправлен 25.09, признак больше не меняет геометрию ряда.",
    },
  ],
  refUrl: "https://satin.merfy.ru/",
  liveCss: LIVE_CSS,
  assetBase: "https://8afc7b1ed6ee.merfy.ru/",
  catalog: { products, collections, publications },
  sections: [
    {
      name: "header",
      blocks: ["PromoBanner", "Header"],
      refIndex: 0,
      props: {
        PromoBanner: {
          id: "PromoBanner-1",
          text: "Скидка 10% на общую сумму заказа от 9 000₽.",
          link: { text: "Перейти", href: "/catalog/" },
        },
        Header: {
          id: "Header-1",
          siteTitle: "Satin",
          navigationLinks: nav([
            ["Коллекции", "/catalog/"],
            ["История", "/about/"],
            ["Контакты", "/contacts/"],
          ]),
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
          heading: { text: "STYLE’S WEAR COLLECTION SINCE 90’" },
          text: { content: "Оставайтесь в центре внимания" },
          primaryButton: { text: "Новые поступления", link: { href: "/catalog/" } },
          backgroundImages: { url1: `${IMG}/Главный_экран.webp` },
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
          collections: ["outerwear", "knitwear", "tops"].map(slot),
        },
      },
    },
    {
      name: "popular",
      blocks: ["PopularProducts"],
      refIndex: 3,
      props: { PopularProducts: popular("PopularProducts-1", "pop-women") },
    },
    {
      name: "rows",
      blocks: ["MultiRows"],
      refIndex: 4,
      props: {
        MultiRows: {
          id: "MultiRows-1",
          rows: [
            {
              id: "row-1",
              image: `${IMG}/Женская_коллекция.webp`,
              title: "Женская коллекция",
              description:
                "Мы уверены: одежда должна быть красивой не только на фотографиях, но и на ощупь. Satin создан для тех, кто ценит эстетику и качество в каждой детали.\n\nВ ассортименте Satin вы не найдёте случайных вещей — только то, что действительно достойно стать частью вашего гардероба.",
              button: { text: "Для женщин", link: "/catalog?collection=Женское" },
            },
            {
              id: "row-2",
              image: `${IMG}/Мужская_коллекция.webp`,
              title: "Мужская коллекция",
              description:
                "Минимализм, точная посадка и спокойный силуэт — мужская линия Satin собирает базовые вещи без лишних деталей.\n\nОдежда, которая не требует усилий, чтобы выглядеть хорошо.",
              button: { text: "Для мужчин", link: "/catalog?collection=Мужское" },
            },
          ],
        },
      },
    },
    {
      name: "text",
      blocks: ["MainText"],
      refIndex: 5,
      props: {
        MainText: {
          id: "MainText-1",
          heading: { text: "Одежда, в которой не нужно стараться выглядеть хорошо" },
          text: {
            content:
              "Мы делаем вещи, которые работают на вас, а не наоборот. Хлопок и лён, которые приятно носить в жару. Крой, который не сковывает и не растягивается после третьей стирки. Палитра, где любой верх подходит к любому низу — без мучений перед зеркалом. Каждая вещь проходит три этапа примерки на реальных людях до того, как попадает в каталог. Без логомании, без кричащих принтов, без вещей-однодневок. Только базовый гардероб, к которому хочется возвращаться.",
          },
        },
      },
    },
    {
      name: "banner",
      blocks: ["ImageWithText"],
      refIndex: 6,
      props: {
        ImageWithText: {
          id: "ImageWithText-1",
          image: { url: `${IMG}/Мужская_кампания.webp` },
          heading: { text: "STYLE’S WEAR COLLECTION SINCE 90’" },
          text: { content: "Новая мужская коллекция" },
          button: { text: "Перейти", link: "/catalog?collection=Мужское" },
        },
      },
    },
    {
      name: "collections-2",
      blocks: ["Collections"],
      refIndex: 7,
      props: {
        Collections: {
          id: "Collections-2",
          collections: ["outerwear-2", "knitwear-2", "polo-2"].map(slot),
        },
      },
    },
    {
      name: "popular-2",
      blocks: ["PopularProducts"],
      refIndex: 8,
      props: { PopularProducts: popular("PopularProducts-2", "pop-men") },
    },
    {
      name: "features",
      blocks: ["MultiColumns"],
      refIndex: 9,
      props: {
        MultiColumns: {
          id: "MultiColumns-1",
          columns: [
            {
              id: "col-1",
              image: `${IMG}/feature-materials.webp`,
              title: "Исключительно качественные материалы",
              description:
                "Мы выбираем только натуральные ткани премиум-класса: мягкий хлопок, дышащий лён и струящуюся вискозу. Вещи не теряют форму и не вызывают раздражения даже при круглосуточной носке. Ваша кожа скажет спасибо — каждый день вы будете чувствовать себя в уюте и невесомости.",
            },
            {
              id: "col-2",
              image: `${IMG}/feature-delivery.webp`,
              title: "Быстрая доставка до любой точки России",
              description:
                "Отправляем заказы по всей России ежедневно, включая отдалённые населённые пункты. Собственная упаковка гарантирует сохранность товара даже при долгой транспортировке. Средний срок доставки по стране — всего 4–5 дней.",
            },
          ],
          displayColumns: 2,
          // Карточки верстальщиков на подложке — наш «Контейнер».
          containerEnabled: "true",
        },
      },
    },
    {
      name: "journal",
      blocks: ["Publications"],
      refIndex: 10,
      // Над журналом у верстальщиков заголовка нет. Пустой заголовок у нас —
      // пустое состояние (плейсхолдер «Публикации»), поэтому заголовок скрыт
      // «глазом» панели, как это сделал бы мерчант.
      props: { Publications: { id: "Publications-1", hiddenFields: ["heading"], cardsCount: 3 } },
    },
    {
      name: "faq",
      blocks: ["CollapsibleSection"],
      refIndex: 11,
      props: {
        CollapsibleSection: {
          id: "CollapsibleSection-1",
          // Заголовка у верстальщиков нет — скрыт «глазом» (пустой = плейсхолдер).
          hiddenFields: ["heading"],
          sections: [
            {
              id: "faq-1",
              heading: "Как узнать свой размер?",
              content:
                "Рекомендуем воспользоваться таблицей размеров, которая есть в карточке каждого товара. Указывайте свои мерки (обхват груди, талии, бёдер) и сверяйте их с таблицей. Если сомневаетесь, напишите нашему консультанту в онлайн-чат с вашими параметрами — мы поможем подобрать подходящий размер.",
            },
            {
              id: "faq-2",
              heading: "Какой у вас срок доставки?",
              content:
                "Время доставки в регионы России занимает от 3 до 10 рабочих дней в зависимости от удалённости. Точные сроки и стоимость вы увидите при оформлении заказа, выбрав свой город.",
            },
            {
              id: "faq-3",
              heading: "Можно ли вернуть или обменять товар?",
              content:
                "Да, конечно. В соответствии с законом о защите прав потребителей вы можете обменять неподошедшую вещь (кроме изделий из категорий «бельё» и «носки») в течение 14 дней с момента получения при сохранении товарного вида, бирок и чека.",
            },
          ],
        },
      },
    },
    {
      name: "footer",
      blocks: ["Footer"],
      refIndex: 12,
      props: {
        Footer: {
          id: "Footer-1",
          siteTitle: "Satin",
          navigationColumn: {
            title: "",
            links: nav([
              ["Коллекции", "/catalog/"],
              ["История", "/about/"],
              ["Контакты", "/contacts/"],
            ]),
          },
          // Нижний ряд подвала у нас — «информационная» колонка (политики).
          informationColumn: {
            title: "",
            links: nav([
              ["Политика доставки", "/legal/delivery/"],
              ["Политика возврата", "/legal/return/"],
              ["Условия обслуживания", "/legal/terms/"],
              ["Политика конфиденциальности", "/legal/privacy/"],
            ]),
          },
          socialColumn: {
            email: "example@satin.merfy",
            socialLinks: [
              { platform: "telegram", href: "https://t.me/" },
              { platform: "vk", href: "https://vk.com/" },
              { platform: "tiktok", href: "https://tiktok.com/" },
              { platform: "youtube", href: "https://youtube.com/" },
              { platform: "dzen", href: "https://dzen.ru/" },
            ],
          },
          copyright: "© 2026 Satin Theme Все права защищены.",
          bottomStrip: { text: "© 2026 Satin Theme Все права защищены. Powered by Merfy" },
          // Контакты и касса магазина — у нас их подставляет сборка из настроек магазина.
          phone: "+7 (000) 000-00-00",
          paymentEnabled: true,
        },
      },
    },
  ],
};
