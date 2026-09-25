import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * Satin — геометрия как в актуальной вёрстке верстальщиков
 * (Merfy-Dropshipping-Platform/Satin-theme @cb548963d1c61c9d9bb2e2a87af1b3cdba960689),
 * под PARITY_DESIGN.
 *
 * Владелец 23–24.09: «делать как верстальщики, актуально, в точности», «не
 * сломай цветовые схемы, ничего не сломай, нужно только стили, базовые».
 *
 *  ШАПКА (Header.astro): переход мобильная↔десктопная строка — на md (768px),
 *    как у верстальщиков (Header.astro:56 «md:hidden», :86 «md:flex»), а не на
 *    lg (1024px, «как rose»). Тот же порог синхронно двигают: скрытие
 *    инлайн-меню при menuType=sidebar, сторона/ширина выезда шторки и
 *    JS-порог поиска (data-design-parity → matchMedia).
 *
 *  ПОДВАЛ (Footer.astro): верхний ряд десктопа при выравнивании по умолчанию
 *    («слева») без лишнего gap-10 (верстальщик держит только justify-between);
 *    подпись платформы в чёрной полосе — md:16px (у нас md:14px, решение
 *    тестера 15.09 — под признаком уступает вёрстке верстальщиков).
 *
 *  КАРТОЧКИ «Популярного» (Popular.astro): без явного «Вид изображения»
 *    карточка рисуется родной пропорцией 430/564 (её несёт сама
 *    SatinProductCard.astro) — сейчас Popular.astro всегда накладывает
 *    оверрайд aspect-square, даже когда imageView вообще не задан. Puck
 *    бэкает defaults.imageView='square' в пропсы при вставке блока, поэтому
 *    отличить «мерчант нажал Квадрат» от «дефолт панели» можно ТОЛЬКО для
 *    нетронутого сида (imageView===undefined, не 'square') — под признаком
 *    оверрайд снимается именно для этого случая; любое явное значение
 *    ('square' в т.ч.) рисуется как раньше.
 *
 * Капс верстальщиков НЕ переносим (владелец 13.09 велел его убрать). Без
 * признака разметка байт в байт прежняя.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ВКЛ = { __designParity: true };

function отрисовать(
  jobs: { block: string; props: Record<string, unknown> }[],
): string[] {
  return renderSections(
    "satin",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

describe("satin Header: переход мобильная↔десктопная строка на md под PARITY_DESIGN", () => {
  const БАЗА = { id: "Header-1", colorScheme: "scheme-1" };

  it("с признаком — порог md, без lg", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(html).toContain(
      "relative z-[60] flex h-14 items-center justify-between bg-[rgb(var(--color-bg,255_255_255))] px-4 md:hidden",
    );
    expect(html).toContain("hidden w-full md:block");
    expect(html).not.toContain(
      "relative z-[60] flex h-14 items-center justify-between bg-[rgb(var(--color-bg,255_255_255))] px-4 lg:hidden",
    );
    expect(html).not.toContain("hidden w-full lg:block");
    expect(html).toContain('data-design-parity="true"');
  });

  it("без признака и с явным __designParity:false — разметка байт в байт прежняя (lg)", () => {
    const [безПризнака, признакВыкл] = отрисовать([
      { block: "Header", props: БАЗА },
      { block: "Header", props: { ...БАЗА, __designParity: false } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(безПризнака).toContain(
      "relative z-[60] flex h-14 items-center justify-between bg-[rgb(var(--color-bg,255_255_255))] px-4 lg:hidden",
    );
    expect(безПризнака).toContain("hidden w-full lg:block");
    expect(безПризнака).not.toContain("md:hidden");
    expect(безПризнака).not.toContain("md:block");
    expect(безПризнака).not.toContain('data-design-parity="true"');
  });

  it("menuType=sidebar: инлайн-меню и выезд шторки следуют тому же порогу", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ, menuType: "sidebar" } },
      { block: "Header", props: { ...БАЗА, menuType: "sidebar" } },
    ]);
    expect(сПризнаком).toContain("md:!hidden");
    expect(сПризнаком).not.toContain("lg:!hidden");
    expect(сПризнаком).toContain("md:left-auto md:w-[360px]");
    expect(сПризнаком).not.toContain("lg:left-auto");
    expect(безПризнака).toContain("lg:!hidden");
    expect(безПризнака).not.toContain("md:!hidden");
    expect(безПризнака).toContain("lg:left-auto lg:w-[360px]");
  });

  it("меню-дефолт (dropdown): нижняя шторка мобильного бургера тоже на md", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
      { block: "Header", props: БАЗА },
    ]);
    expect(сПризнаком).toContain("pb-8 md:hidden [clip-path:inset(0)]");
    expect(безПризнака).toContain("pb-8 lg:hidden [clip-path:inset(0)]");
  });

  it("JS-порог поиска несёт оба значения статично, режим решает data-атрибут в рантайме", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(html).toContain("767.98");
    expect(html).toContain("1023.98");
    expect(html).toContain("data-design-parity");
  });

  it("настройки шапки продолжают менять разметку под признаком: логотип, меню, липкость, отступы", () => {
    // Базовая (без явного logoPosition) уже приходит «center-absolute» —
    // это дефолт темы (theme.json blockDefaults), не наша правка; поэтому
    // «center-absolute» здесь не отдельный вариант, а сама база.
    const база = { ...БАЗА, ...ВКЛ };
    const [исходная, ...варианты] = отрисовать([
      { block: "Header", props: база },
      { block: "Header", props: { ...база, logoPosition: "top-left" } },
      { block: "Header", props: { ...база, logoPosition: "top-center" } },
      { block: "Header", props: { ...база, logoPosition: "center-left" } },
      { block: "Header", props: { ...база, menuType: "mega-menu" } },
      { block: "Header", props: { ...база, menuType: "sidebar" } },
      { block: "Header", props: { ...база, stickiness: "always" } },
      { block: "Header", props: { ...база, stickiness: "scroll-up" } },
      { block: "Header", props: { ...база, padding: { top: 32, bottom: 32 } } },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("капса не добавилось: число uppercase-классов совпадает с/без признака", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
      { block: "Header", props: БАЗА },
    ]);
    const считатьUppercase = (html: string) =>
      [...html.matchAll(/class="[^"]*"/g)].filter((m) =>
        /\buppercase\b/.test(m[0]),
      ).length;
    expect(считатьUppercase(сПризнаком)).toBe(считатьUppercase(безПризнака));
  });
});

describe("satin Footer: верхний ряд без лишнего gap-10, подпись платформы 16px под PARITY_DESIGN", () => {
  const БАЗА = {
    id: "Footer-1",
    colorScheme: "scheme-1",
    copyright: "© Магазин",
  };

  it("с признаком, выравнивание по умолчанию — без gap-10, подпись 16px", () => {
    const [html] = отрисовать([
      { block: "Footer", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(html).not.toContain("flex items-start gap-10 md:justify-between");
    expect(html).toContain("flex items-start md:justify-between");
    expect(html).toContain("md:text-[16px]");
    expect(html).not.toContain("md:text-[14px]");
  });

  it("без признака и с явным __designParity:false — разметка байт в байт прежняя", () => {
    const [безПризнака, признакВыкл] = отрисовать([
      { block: "Footer", props: БАЗА },
      { block: "Footer", props: { ...БАЗА, __designParity: false } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(безПризнака).toContain("flex items-start gap-10 md:justify-between");
    expect(безПризнака).toContain("md:text-[14px]");
    expect(безПризнака).not.toContain("md:text-[16px]");
  });

  it("contentAlign=right — свой зазор не трогаем (настройка продолжает работать)", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Footer", props: { ...БАЗА, ...ВКЛ, contentAlign: "right" } },
      { block: "Footer", props: { ...БАЗА, contentAlign: "right" } },
    ]);
    expect(сПризнаком).toContain("gap-10");
    expect(безПризнака).toContain("gap-10");
    // Подпись платформы не завязана на contentAlign — она всё равно уступает
    // вёрстке верстальщиков под признаком.
    expect(сПризнаком).toContain("md:text-[16px]");
  });

  it("остальные настройки по-прежнему меняют секцию под признаком", () => {
    const база = { ...БАЗА, ...ВКЛ };
    const [исходная, ...варианты] = отрисовать([
      { block: "Footer", props: база },
      { block: "Footer", props: { ...база, contentAlign: "center" } },
      { block: "Footer", props: { ...база, padding: { top: 24, bottom: 24 } } },
      { block: "Footer", props: { ...база, phone: "+7 900 000-00-00" } },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("капса не добавилось: число uppercase-классов совпадает с/без признака", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Footer", props: { ...БАЗА, ...ВКЛ } },
      { block: "Footer", props: БАЗА },
    ]);
    const считатьUppercase = (html: string) =>
      [...html.matchAll(/class="[^"]*"/g)].filter((m) =>
        /\buppercase\b/.test(m[0]),
      ).length;
    expect(считатьUppercase(сПризнаком)).toBe(считатьUppercase(безПризнака));
  });
});

describe("satin PopularProducts: карточка без явного «Вид изображения» — родная 430/564 под PARITY_DESIGN", () => {
  const БАЗА = { id: "PopularProducts-1", colorScheme: "scheme-1" };
  // Без "[&_" в начале: Astro отдаёт `&` динамического class-атрибута как
  // сущность `&#38;` (в статичных class="..." строках такого нет) — токен без
  // амперсанда однозначно ловит именно этот селектор-оверрайд независимо от
  // его кодировки.
  const ОВЕРРАЙД = "_li>article>div:first-child]:aspect-square";

  it("нетронутый сид (imageView отсутствует) — оверрайд снят, родная пропорция видна", () => {
    const [html] = отрисовать([
      { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(html).not.toContain(ОВЕРРАЙД);
    expect(html).toContain("aspect-[430/564]");
  });

  it("явный 'square' — оверрайд остаётся даже под признаком (различимый выбор мерчанта)", () => {
    const [html] = отрисовать([
      {
        block: "PopularProducts",
        props: { ...БАЗА, ...ВКЛ, imageView: "square" },
      },
    ]);
    expect(html).toContain(ОВЕРРАЙД);
  });

  it("явный 'portrait'/'wide' — как раньше, независимо от признака", () => {
    const [portrait, wide] = отрисовать([
      {
        block: "PopularProducts",
        props: { ...БАЗА, ...ВКЛ, imageView: "portrait" },
      },
      {
        block: "PopularProducts",
        props: { ...БАЗА, ...ВКЛ, imageView: "wide" },
      },
    ]);
    expect(portrait).not.toContain(ОВЕРРАЙД);
    expect(portrait).toContain("aspect-[430/500]");
    expect(wide).not.toContain(ОВЕРРАЙД);
    expect(wide).toContain("aspect-[16/9]");
  });

  it("без признака и с явным __designParity:false — разметка байт в байт прежняя (оверрайд square)", () => {
    const [безПризнака, признакВыкл] = отрисовать([
      { block: "PopularProducts", props: БАЗА },
      { block: "PopularProducts", props: { ...БАЗА, __designParity: false } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(безПризнака).toContain(ОВЕРРАЙД);
  });

  it("без признака явный 'square' тоже не меняется — байт в байт", () => {
    const [сПризнакомВыкл, безПризнака] = отрисовать([
      {
        block: "PopularProducts",
        props: { ...БАЗА, imageView: "square", __designParity: false },
      },
      { block: "PopularProducts", props: { ...БАЗА, imageView: "square" } },
    ]);
    expect(сПризнакомВыкл).toEqual(безПризнака);
  });

  it("капса не добавилось: число uppercase-классов совпадает с/без признака", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
      { block: "PopularProducts", props: БАЗА },
    ]);
    const считатьUppercase = (html: string) =>
      [...html.matchAll(/class="[^"]*"/g)].filter((m) =>
        /\buppercase\b/.test(m[0]),
      ).length;
    expect(считатьUppercase(сПризнаком)).toBe(считатьUppercase(безПризнака));
  });
});

/**
 * Цель «как у верстальщиков» (24.09, scripts/qa/designer-goal.ts satin):
 * шапка в одну строку, полоса объявления, основной текст, «Изображение с
 * текстом». С признаком — классы верстальщиков ТОЛЬКО для незаданных
 * настроек; без признака — байт в байт; капс не растёт.
 *
 * ИСКЛЮЧЕНИЕ — «Мультиряды» (MultiRows). 25.09: геометрия ряда верстальщика
 * (md:grid-cols-2 md:gap-10, ряды gap-12 md:gap-20) была РЕГРЕССОМ решений
 * владельца 17–20.09 (ряд впритык, у текста md:p-8, доли ROW_SPLIT) — см.
 * describe ниже. Для этого блока признак геометрию НЕ меняет вовсе.
 */
const считатьКапс = (html: string) =>
  [...html.matchAll(/class="[^"]*"/g)].filter((m) => /\buppercase\b/.test(m[0])).length;

function байтВБайтИКапс(block: string, база: Record<string, unknown>) {
  const [безПризнака, признакВыкл, сПризнаком] = отрисовать([
    { block, props: база },
    { block, props: { ...база, __designParity: false } },
    { block, props: { ...база, ...ВКЛ } },
  ]);
  expect(признакВыкл).toEqual(безПризнака);
  expect(считатьКапс(сПризнаком)).toBe(считатьКапс(безПризнака));
  return { безПризнака, сПризнаком };
}

describe("satin Header: «логотип по центру» — меню и иконки в той же строке под PARITY_DESIGN", () => {
  const БАЗА = { id: "Header-1", colorScheme: "scheme-1", logoPosition: "center-absolute" };

  it("с признаком строка грида плотная (grid-flow-dense), без — прежняя", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("Header", БАЗА);
    expect(сПризнаком).toContain("grid grid-cols-[1fr_auto_1fr] grid-flow-dense");
    expect(безПризнака).not.toContain("grid-flow-dense");
  });

  it("другие положения логотипа не трогаем", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ, logoPosition: "top-left" } },
    ]);
    expect(html).not.toContain("grid-flow-dense");
  });
});

describe("satin PromoBanner: полоса верстальщика py-2, 11/md:14 — только без «Размера»", () => {
  const БАЗА = { id: "PromoBanner-1", text: "Скидка 10%", link: { text: "Перейти", href: "/catalog" } };

  it("с признаком и без size — полоса верстальщика; без признака — min-h-12 / 16px", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("PromoBanner", БАЗА);
    expect(сПризнаком).toContain("flex py-2 w-full");
    expect(сПризнаком).toContain("text-[11px] md:text-[14px]");
    expect(безПризнака).toContain("flex min-h-12 w-full");
    expect(безПризнака).not.toContain("md:text-[14px]");
  });

  it("выбранный мерчантом размер работает как раньше и под признаком", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "PromoBanner", props: { ...БАЗА, ...ВКЛ, size: "large" } },
      { block: "PromoBanner", props: { ...БАЗА, size: "large" } },
    ]);
    expect(сПризнаком).toEqual(безПризнака);
    expect(сПризнаком).toContain("min-h-12");
  });
});

describe("satin MultiRows: решение владельца 17–20.09 главнее геометрии верстальщика под PARITY_DESIGN (регресс 24.09 7c87010e)", () => {
  const РЯДЫ = [
    { id: "r1", title: "Женская", description: "Текст", button: { text: "Для женщин", link: "/catalog" } },
    { id: "r2", title: "Мужская", description: "Текст", button: { text: "Для мужчин", link: "/catalog" } },
  ];
  const БАЗА = { id: "MultiRows-1", rows: РЯДЫ };

  it("с признаком геометрия ряда та же, что без признака: пара впритык (md:gap-0), у текста md:p-8, доли ROW_SPLIT, между рядами gap-8 — геометрия верстальщика (md:grid-cols-2 md:gap-10, gap-12 md:gap-20) не рисуется НИКОГДА", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("MultiRows", БАЗА);
    for (const html of [сПризнаком, безПризнака]) {
      expect(html).toContain("grid grid-cols-1 items-stretch gap-8 md:gap-0");
      expect(html).toContain("md:grid-cols-[3fr_2fr]");
      expect(html).toContain("md:p-8");
      expect(html).not.toContain("md:grid-cols-2 md:gap-10");
      expect(html).not.toContain("gap-12 md:gap-20");
    }
  });

  it("размер текста ряда без своего значения — отдельная настройка (ROW_TEXT_CLS.designers), эта задача её не трогает: под признаком флэт 16px без md:, без признака md:text-[20px]", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "MultiRows", props: { ...БАЗА, ...ВКЛ } },
      { block: "MultiRows", props: БАЗА },
    ]);
    expect(сПризнаком).not.toContain("md:text-[20px]");
    expect(безПризнака).toContain("md:text-[20px]");
  });

  it("заданные «Ширина» и «Размер текста» работают как раньше под признаком", () => {
    const [ширина, текст] = отрисовать([
      { block: "MultiRows", props: { ...БАЗА, ...ВКЛ, width: "small" } },
      { block: "MultiRows", props: { ...БАЗА, ...ВКЛ, rows: РЯДЫ.map((r) => ({ ...r, textSize: "medium" })) } },
    ]);
    expect(ширина).toContain("md:grid-cols-[2fr_3fr]");
    expect(ширина).toContain("md:p-8");
    expect(текст).toContain("md:text-[20px]");
  });
});

describe("satin MainText: текст 16 и блок влево во всю ширину — только без «Позиции»/«Размера текста»", () => {
  const БАЗА = { id: "MainText-1", heading: { text: "Заголовок" }, text: { content: "Текст" } };

  it("с признаком — как у верстальщика; без — прежний центр и md:20px", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("MainText", БАЗА);
    expect(сПризнаком).toContain("flex w-full flex-col gap-4 items-start text-left");
    expect(сПризнаком).not.toContain("md:text-[20px]");
    expect(безПризнака).toContain("mx-auto items-center text-center");
    expect(безПризнака).toContain("md:text-[20px]");
  });

  it("выбранные позиция и размер работают как раньше под признаком", () => {
    const [центр, лево, средний] = отрисовать([
      { block: "MainText", props: { ...БАЗА, ...ВКЛ, position: "center" } },
      { block: "MainText", props: { ...БАЗА, ...ВКЛ, position: "left" } },
      { block: "MainText", props: { ...БАЗА, ...ВКЛ, textSize: "medium" } },
    ]);
    expect(центр).toContain("mx-auto items-center text-center");
    expect(лево).toContain("max-w-[600px] mr-auto items-start text-left");
    expect(средний).toContain("md:text-[20px]");
  });
});

describe("satin ImageWithText: фото и текст встык — только без «Ширины»", () => {
  const БАЗА = { id: "ImageWithText-1", heading: { text: "Заголовок" }, image: { url: "https://example.com/a.webp" } };

  it("с признаком — без зазора; без признака — md:gap-x-10", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("ImageWithText", БАЗА);
    expect(сПризнаком).not.toContain("md:gap-x-10");
    expect(безПризнака).toContain("md:grid-cols-2 md:gap-x-10");
  });

  it("заданная ширина держит зазор и под признаком", () => {
    const [html] = отрисовать([
      { block: "ImageWithText", props: { ...БАЗА, ...ВКЛ, width: "large" } },
    ]);
    expect(html).toContain("md:gap-x-10");
  });
});
