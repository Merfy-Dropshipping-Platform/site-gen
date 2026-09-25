import { renderSections } from "../../../scripts/qa/lib/render";

// Этот файл сравнивает ДВЕ ветки кода: «как у верстальщиков» (признак
// `__designParity: true` задаётся явно) и прежнюю. Покупатель видит первую —
// она проверяется явным признаком. Чтобы «признак не указан» здесь значил
// прежнюю ветку (так задуманы сравнения), выключатель в этом файле выключен;
// остальные спеки рисуют как прод (jest.setup-prod-parity.ts).
process.env.PARITY_DESIGN = "off";
afterEach(() => {
  process.env.PARITY_DESIGN = "off";
});

/**
 * bloom по цели «как у верстальщиков» (владелец 24.09: «нужно как у
 * верстальщиков, но не ломать структуру секций, их настроек, цветовых схем»;
 * его интересуют размеры и ширина). Эталон — Bloom-theme @5aae2ad6, замер —
 * scripts/qa/designer-goal.ts bloom на восьми ширинах.
 *
 * Под PARITY_DESIGN:
 *   «Первый экран»: заголовок 14 → md 20, текст 12 → md 16 (оба leading-normal),
 *     колонка 330 → md 410 с полем py-10 pr-10, 32 между текстом и кнопкой,
 *     кнопка 40 → md 48 (кегль 14 → md 16), снизу 80 на телефоне;
 *   «Коллекция товаров»: заголовок 18 → md 20, сетка 1 → sm 2 → lg «Колонки»,
 *     зазор 40 (на lg по горизонтали 16), карточка — 20 между фото и текстом,
 *     текст не ниже 150 с кнопкой внизу, старая цена 14; скрытая «глазом»
 *     «Смотреть все» не оставляет пустой строки;
 *   «Галерея» с двумя плитками: колонки пополам, большая — квадрат, подпись
 *     через 16; три плитки — прежняя раскладка (решает владелец);
 *   «Подвал»: адрес одной строкой, иконки соцсетей 24, нижняя полоса 64 / 16.
 * Настройки размеров работают поверх, цвета не трогаются, капс не переносится.
 * Без признака разметка байт в байт прежняя.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ВКЛ = { __designParity: true };

type Секция = { block: string; props: Record<string, unknown> };

function отрисовать(jobs: Секция[]): string[] {
  return renderSections(
    "bloom",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    // «&» в произвольных классах Tailwind Astro пишет сущностью.
    return (r.html ?? "").replace(/&#38;/g, "&");
  });
}

const ФОТО = "/images/hero-photo.webp";

const СЕКЦИИ: Record<string, Секция> = {
  hero: {
    block: "Hero",
    props: {
      id: "Hero-1",
      colorScheme: "scheme-3",
      heading: { text: "Искусство заботы о себе" },
      text: { content: "Уходовая косметика" },
      primaryButton: { text: "Начать ритуал", link: { href: "/catalog" } },
      backgroundImages: { url1: ФОТО },
    },
  },
  popular: {
    block: "PopularProducts",
    props: { id: "PopularProducts-1", colorScheme: "scheme-3", heading: "Сейчас в тренде", cards: 4, columns: 3 },
  },
  galleryPair: {
    block: "Gallery",
    props: {
      id: "Gallery-1",
      colorScheme: "scheme-3",
      items: [
        { id: "i1", type: "image", url: "/images/balaklava.webp" },
        { id: "i2", type: "product", productId: "p1" },
      ],
    },
  },
  galleryThree: {
    block: "Gallery",
    props: {
      id: "Gallery-1",
      colorScheme: "scheme-3",
      items: [
        { id: "i1", type: "image", url: "/images/balaklava.webp" },
        { id: "i2", type: "image", url: "/images/milk.webp" },
        { id: "i3", type: "product", productId: "p1" },
      ],
    },
  },
  footer: {
    block: "Footer",
    props: {
      id: "Footer-1",
      colorScheme: "scheme-3",
      phone: "+7 900 000-00-00",
      socialColumn: {
        email: "shop@example.com",
        contactFields: [{ label: "Адрес", value: "г. Москва, ул. Пушкина, д. 0" }],
        socialLinks: [{ platform: "vk", href: "https://vk.com/" }],
      },
    },
  },
};

const ИМЕНА = Object.keys(СЕКЦИИ);
const вкл = отрисовать(ИМЕНА.map((n) => ({ ...СЕКЦИИ[n], props: { ...СЕКЦИИ[n].props, ...ВКЛ } })));
const выкл = отрисовать(ИМЕНА.map((n) => СЕКЦИИ[n]));
const признакЛожь = отрисовать(ИМЕНА.map((n) => ({ ...СЕКЦИИ[n], props: { ...СЕКЦИИ[n].props, __designParity: false } })));
const html = (набор: string[], имя: string) => набор[ИМЕНА.indexOf(имя)];

/** Классы первого тега, у которого в class есть метка. */
const классы = (h: string, метка: string): string => {
  const m = [...h.matchAll(/class="([^"]*)"/g)].map((x) => x[1]).find((c) => c.includes(метка));
  expect(m).toBeDefined();
  return m!;
};

describe("bloom по цели: без признака разметка прежняя", () => {
  it.each(ИМЕНА)("%s: __designParity=false = без признака, с признаком — другая", (имя) => {
    expect(html(признакЛожь, имя)).toEqual(html(выкл, имя));
    expect(html(вкл, имя)).not.toEqual(html(выкл, имя));
  });

  it("капс верстальщиков не перенесён", () => {
    for (const h of вкл) expect(h).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("«Первый экран»: текстовый блок как у верстальщиков", () => {
  it("кегли по умолчанию 14/20 и 12/16, строки leading-normal", () => {
    const h = html(вкл, "hero");
    expect(классы(h, "hero-over-photo-heading")).toContain("text-[14px] font-normal leading-normal hero-over-photo-heading md:text-[20px]");
    expect(классы(h, "hero-over-photo-text")).toContain("text-[12px] font-light leading-normal hero-over-photo-text md:text-[16px]");
    const прежний = html(выкл, "hero");
    expect(классы(прежний, "hero-over-photo-heading")).toContain("text-[18px]");
  });

  it("колонка 330 → md 410, 32 до кнопки, кнопка 40 → md 48, снизу 80", () => {
    const h = html(вкл, "hero");
    expect(h).toContain("max-w-[330px] md:max-w-[410px] md:py-10 md:pr-10");
    expect(h).toMatch(/flex-col items-start gap-8/);
    expect(h).toContain("h-10 md:h-12");
    expect(h).toContain("px-3 md:px-4");
    expect(h).toContain("text-[14px] md:text-[16px]");
    expect(h).toContain(" pb-20 md:px-20");
  });

  it("«Размер заголовка»/«Размер текста», выставленные мерчантом, работают как прежде", () => {
    const задано = { heading: { text: "Заголовок", size: "medium" }, text: { content: "Текст", size: "small" } };
    const [с, без] = отрисовать([
      { block: "Hero", props: { ...СЕКЦИИ.hero.props, ...задано, ...ВКЛ } },
      { block: "Hero", props: { ...СЕКЦИИ.hero.props, ...задано } },
    ]);
    expect(классы(с, "hero-over-photo-heading")).toEqual(классы(без, "hero-over-photo-heading"));
    expect(классы(с, "hero-over-photo-text")).toEqual(классы(без, "hero-over-photo-text"));
  });

  it("с «Контейнером» внутреннее поле верстальщиков не добавляется", () => {
    const [h] = отрисовать([{ block: "Hero", props: { ...СЕКЦИИ.hero.props, container: "true", ...ВКЛ } }]);
    expect(h).toContain("max-w-[330px] md:max-w-[410px]");
    expect(h).not.toContain("md:py-10 md:pr-10");
  });
});

describe("«Коллекция товаров»: сетка и карточка как у верстальщиков", () => {
  it("сетка 1 → sm 2 → lg «Колонки», признак на сетке и стиль-добавка", () => {
    const h = html(вкл, "popular");
    expect(h).toContain("grid grid-cols-1 gap-10 sm:grid-cols-2 lg:gap-x-4");
    expect(h).toContain("data-design-parity");
    expect(h).toContain("min-height:150px");
    expect(h).toContain("(min-width:768px) and (max-width:1023.98px)");
    expect(h).toMatch(/\.bloom-product-oldprice\{font-size:14px\}/);
  });

  it("без признака — прежняя сетка, ни признака, ни стиль-добавки", () => {
    const h = html(выкл, "popular");
    expect(h).toContain("grid grid-cols-2 gap-4 sm:grid-cols-3");
    expect(h).not.toContain("data-design-parity");
    expect(h).not.toContain("min-height:150px");
  });

  it("заголовок по умолчанию 18 → md 20; «Средний» — как прежде", () => {
    expect(html(вкл, "popular")).toContain("[&_h2]:!text-[18px] md:[&_h2]:!text-[20px] [&_h2]:!leading-none");
    const [средний] = отрисовать([
      { block: "PopularProducts", props: { ...СЕКЦИИ.popular.props, headingSize: "medium", ...ВКЛ } },
    ]);
    expect(средний).toContain("[&_h2]:!text-[38px]");
    expect(средний).not.toContain("[&_h2]:!text-[18px]");
  });

  it("«Смотреть все», скрытая «глазом», не оставляет пустой строки", () => {
    const скрыта = { ...СЕКЦИИ.popular.props, hiddenFields: ["viewAll"] };
    const [с, без] = отрисовать([
      { block: "PopularProducts", props: { ...скрыта, ...ВКЛ } },
      { block: "PopularProducts", props: скрыта },
    ]);
    expect(с).not.toContain('<div class="flex w-full justify-center">');
    expect(без).toContain('<div class="flex w-full justify-center">');
  });
});

describe("«Галерея»: две плитки — низы на одной линии (владелец 25.09), три — прежние", () => {
  it("две плитки: колонки пополам, грид тянет пару (items-stretch), большая — квадрат (не тянется)", () => {
    const h = html(вкл, "galleryPair");
    expect(h).toContain("grid-cols-1 items-start gap-4 lg:items-stretch lg:grid-cols-2");
    // Квадрат задаёт высоту строки — сам НЕ тянется (иначе перестал бы быть квадратом).
    const hero = классы(h, "aspect-square");
    expect(hero).toContain("aspect-square");
    expect(hero).not.toContain("lg:h-full");
    expect(hero).not.toContain("lg:aspect-auto");
  });

  it("две плитки: боковая — flex-колонка во всю высоту строки, фото растёт (не подпись)", () => {
    const h = html(вкл, "galleryPair");
    // Ссылка боковой плитки — flex-колонка на всю высоту (lg:h-full получает
    // высоту от lg:items-stretch грида выше).
    const anchor = классы(h, "lg:h-full");
    expect(anchor).toContain("lg:flex");
    expect(anchor).toContain("lg:h-full");
    expect(anchor).toContain("lg:flex-col");
    // Фото-бокс без своего аспекта на lg — растёт (flex-1), кроп через object-cover
    // (не сплющивание): мобильный аспект 652/594 остаётся базой.
    const photo = классы(h, "lg:flex-1");
    expect(photo).toContain("aspect-[652/594]");
    expect(photo).toContain("lg:aspect-auto");
    expect(photo).toContain("lg:min-h-0");
    expect(photo).toContain("lg:flex-1");
    // Подпись — прежнего размера, сама не тянется (растёт фото, не она).
    expect(h).toContain("mt-4 flex flex-col gap-1");
  });

  it("три плитки: прежняя раскладка (узкая правая колонка)", () => {
    const h = html(вкл, "galleryThree");
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(280px,429px)]");
    expect(h).toContain("lg:items-stretch");
    expect(h).toContain("lg:aspect-auto lg:h-full");
  });
});

describe("«Подвал»: адрес, иконки и нижняя полоса как у верстальщиков", () => {
  it("адрес одной строкой, иконки 24, полоса 64 с текстом 16", () => {
    const h = html(вкл, "footer");
    expect(h).toContain("г. Москва, ул. Пушкина, д. 0");
    expect(h).toMatch(/class="size-6 flex items-center justify-center/);
    expect(h).toContain("flex h-16 items-center justify-center");
    expect(h).toMatch(/text-center font-inter text-\[16px\] font-light/);
  });

  it("без признака — адрес по строкам, иконки 32-40, полоса py-5", () => {
    const h = html(выкл, "footer");
    expect(h).not.toContain("г. Москва, ул. Пушкина, д. 0");
    expect(h).toContain("w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10");
    expect(h).toMatch(/\] py-5"/);
  });
});
