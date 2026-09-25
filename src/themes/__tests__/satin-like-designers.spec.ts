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
 *  КАРТОЧКИ «Популярного» (Popular.astro): 24.09 без явного «Вид
 *    изображения» карточка под признаком рисовалась родной пропорцией
 *    430/564. Владелец 25.09 «что в панели — то и на витрине»: панель
 *    показывает «Квадрат», первая правка секции его вписывала, и карточки
 *    меняли пропорцию; 430/564 не совпадает ни с одним вариантом панели,
 *    поэтому не заданный вид — «Квадрат» и под признаком.
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
    expect(html).not.toContain("data-design-parity");
  });

  // Владелец 25.09: одна версия секции — прежняя ветка (порог lg) удалена,
  // признак режима больше ничего не меняет.
  it("одна версия: с признаком, без него и с явным false — одна и та же разметка (порог md)", () => {
    const [безПризнака, признакВыкл, сПризнаком] = отрисовать([
      { block: "Header", props: БАЗА },
      { block: "Header", props: { ...БАЗА, __designParity: false } },
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(сПризнаком).toEqual(безПризнака);
    expect(безПризнака).toContain("hidden w-full md:block");
    expect(безПризнака).not.toContain("hidden w-full lg:block");
  });

  it("menuType=sidebar: инлайн-меню и выезд шторки следуют тому же порогу", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ, menuType: "sidebar" } },
      { block: "Header", props: { ...БАЗА, menuType: "sidebar" } },
    ]);
    expect(сПризнаком).toContain("md:!hidden");
    expect(сПризнаком).not.toContain("lg:!hidden");
    // Сторона панели (25.09, владелец: бургер слева на любой ширине — см.
    // header-burger-position.spec.ts) — right-auto, не left-auto; порог
    // (md под парити, lg без) эта проверка держит по-прежнему.
    expect(сПризнаком).toContain("md:right-auto md:w-[360px]");
    expect(сПризнаком).not.toContain("lg:right-auto");
    // Одна версия: без признака — то же самое.
    expect(безПризнака).toEqual(сПризнаком);
  });

  it("меню-дефолт (dropdown): нижняя шторка мобильного бургера тоже на md", () => {
    const [сПризнаком, безПризнака] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
      { block: "Header", props: БАЗА },
    ]);
    expect(сПризнаком).toContain("pb-8 md:hidden [clip-path:inset(0)]");
    expect(безПризнака).toEqual(сПризнаком);
  });

  it("JS-порог поиска один — md (767.98), без атрибута режима", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(html).toContain("767.98");
    expect(html).not.toContain("1023.98");
    expect(html).not.toContain("data-design-parity");
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

  // Владелец 25.09: одна версия секции — прежняя ветка удалена.
  it("одна версия: с признаком и без — одна и та же разметка", () => {
    const [безПризнака, признакВыкл, сПризнаком] = отрисовать([
      { block: "Footer", props: БАЗА },
      { block: "Footer", props: { ...БАЗА, __designParity: false } },
      { block: "Footer", props: { ...БАЗА, ...ВКЛ } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(сПризнаком).toEqual(безПризнака);
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

describe("satin PopularProducts: не заданный «Вид изображения» — «Квадрат» панели и под PARITY_DESIGN", () => {
  const БАЗА = { id: "PopularProducts-1", colorScheme: "scheme-1" };
  // Без "[&_" в начале: Astro отдаёт `&` динамического class-атрибута как
  // сущность `&#38;` (в статичных class="..." строках такого нет) — токен без
  // амперсанда однозначно ловит именно этот селектор-оверрайд независимо от
  // его кодировки.
  const ОВЕРРАЙД = "_li>article>div:first-child]:aspect-square";

  it("нетронутый сид (imageView отсутствует) под признаком — тот же квадрат, что явный «Квадрат»", () => {
    const [несдан, квадрат] = отрисовать([
      { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
      { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ, imageView: "square" } },
    ]);
    expect(несдан).toContain(ОВЕРРАЙД);
    expect(несдан).toEqual(квадрат);
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
 * настроек, у которых в панели НЕТ значения по умолчанию; без признака —
 * байт в байт; капс не растёт.
 *
 * Владелец 25.09 «что в панели — то и на витрине»: у полосы объявления
 * («Размер» — «Большой») и «Позиции» основного текста («По центру») значение
 * по умолчанию в панели есть, и вид верстальщиков не совпадает ни с одним
 * вариантом (полоса 11px меньше «Маленького», блок во всю ширину — не
 * «Слева» с колонкой 600). Их «не задано» рисует значение панели.
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

  it("строка грида плотная (grid-flow-dense) — одна версия, с признаком и без", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("Header", БАЗА);
    expect(сПризнаком).toContain("grid grid-cols-[1fr_auto_1fr] grid-flow-dense");
    expect(безПризнака).toEqual(сПризнаком);
  });

  it("другие положения логотипа не трогаем", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...БАЗА, ...ВКЛ, logoPosition: "top-left" } },
    ]);
    expect(html).not.toContain("grid-flow-dense");
  });
});

describe("satin PromoBanner: не заданный «Размер» — «Большой» панели и под признаком", () => {
  const БАЗА = { id: "PromoBanner-1", text: "Скидка 10%", link: { text: "Перейти", href: "/catalog" } };

  it("с признаком и без size — та же полоса, что «Большой» (min-h-12 / 16px), полосы верстальщика нет", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("PromoBanner", БАЗА);
    const [большой] = отрисовать([{ block: "PromoBanner", props: { ...БАЗА, ...ВКЛ, size: "large" } }]);
    expect(сПризнаком).toEqual(большой);
    expect(сПризнаком).toContain("flex min-h-12 w-full");
    expect(сПризнаком).not.toContain("flex py-2 w-full");
    expect(сПризнаком).not.toContain("text-[11px] md:text-[14px]");
    expect(безПризнака).toContain("flex min-h-12 w-full");
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
    // Одна версия (владелец 25.09): без признака — то же самое.
    expect(безПризнака).toEqual(сПризнаком);
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

describe("satin MainText: текст 16 без «Размера текста»; «Позиция» не задана — «По центру» панели", () => {
  const БАЗА = { id: "MainText-1", heading: { text: "Заголовок" }, text: { content: "Текст" } };

  it("с признаком — текст верстальщика 16px, блок по центру, как «По центру»; без — прежний центр и md:20px", () => {
    const { безПризнака, сПризнаком } = байтВБайтИКапс("MainText", БАЗА);
    // «Размер текста» в панели значения по умолчанию не имеет — вид
    // верстальщиков при «не задано» остаётся.
    expect(сПризнаком).not.toContain("md:text-[20px]");
    // «Позиция» по умолчанию — «По центру»: блок во всю ширину влево снят.
    expect(сПризнаком).toContain("mx-auto items-center text-center");
    expect(сПризнаком).not.toContain("flex w-full flex-col gap-4 items-start text-left");
    const [центр] = отрисовать([{ block: "MainText", props: { ...БАЗА, ...ВКЛ, position: "center" } }]);
    expect(сПризнаком).toEqual(центр);
    // Одна версия (владелец 25.09): без признака — то же самое.
    expect(безПризнака).toEqual(сПризнаком);
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
    // Одна версия (владелец 25.09): без признака — то же самое.
    expect(безПризнака).toEqual(сПризнаком);
  });

  it("заданная ширина держит зазор и под признаком", () => {
    const [html] = отрисовать([
      { block: "ImageWithText", props: { ...БАЗА, ...ВКЛ, width: "large" } },
    ]);
    expect(html).toContain("md:gap-x-10");
  });
});
