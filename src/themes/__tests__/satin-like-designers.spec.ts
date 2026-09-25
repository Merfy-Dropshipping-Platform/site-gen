import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * Satin — геометрия как в актуальной вёрстке верстальщиков
 * (Merfy-Dropshipping-Platform/Satin-theme @cb548963d1c61c9d9bb2e2a87af1b3cdba960689).
 *
 * Владелец 23–24.09: «делать как верстальщики, актуально, в точности», «не
 * сломай цветовые схемы, ничего не сломай, нужно только стили, базовые».
 * С 25.09 у секций одна версия (владелец: «стили приравнивали, секции и
 * параметры менять не нужно было») — прежняя ветка удалена.
 *
 *  ШАПКА (Header.astro): переход мобильная↔десктопная строка — на md (768px),
 *    как у верстальщиков (Header.astro:56 «md:hidden», :86 «md:flex»), а не на
 *    lg (1024px, «как rose»). Тот же порог синхронно двигают: скрытие
 *    инлайн-меню при menuType=sidebar, сторона/ширина выезда шторки и
 *    JS-порог поиска.
 *
 *  ПОДВАЛ (Footer.astro): верхний ряд десктопа при выравнивании по умолчанию
 *    («слева») без лишнего gap-10 (верстальщик держит только justify-between);
 *    подпись платформы в чёрной полосе — md:16px.
 *
 *  КАРТОЧКИ «Популярного» (Popular.astro): владелец 25.09 «что в панели — то
 *    и на витрине»: панель показывает «Квадрат», первая правка секции его
 *    вписывала, и карточки меняли пропорцию; родная пропорция верстальщиков
 *    430/564 не совпадает ни с одним вариантом панели, поэтому не заданный
 *    вид — «Квадрат».
 *
 * Капс верстальщиков НЕ переносим (владелец 13.09 велел его убрать): число
 * `uppercase`-классов у каждой секции закреплено (`КАПС`).
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };

/** Сколько `uppercase`-классов в разметке секции — больше не должно стать. */
const КАПС = {
  Header: 8,
  Footer: 2,
  PopularProducts: 2,
  PromoBanner: 0,
  MultiRows: 0,
  MainText: 0,
  ImageWithText: 0,
} as const;

const считатьКапс = (html: string) =>
  [...html.matchAll(/class="[^"]*"/g)].filter((m) => /\buppercase\b/.test(m[0])).length;

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

describe("satin Header: переход мобильная↔десктопная строка на md", () => {
  const БАЗА = { id: "Header-1", colorScheme: "scheme-1" };

  it("порог md, без lg", () => {
    const [html] = отрисовать([{ block: "Header", props: БАЗА }]);
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

  it("menuType=sidebar: инлайн-меню и выезд шторки следуют тому же порогу", () => {
    const [html] = отрисовать([{ block: "Header", props: { ...БАЗА, menuType: "sidebar" } }]);
    expect(html).toContain("md:!hidden");
    expect(html).not.toContain("lg:!hidden");
    // Сторона панели (25.09, владелец: бургер слева на любой ширине — см.
    // header-burger-position.spec.ts) — right-auto, не left-auto; порог md.
    expect(html).toContain("md:right-auto md:w-[360px]");
    expect(html).not.toContain("lg:right-auto");
  });

  it("меню-дефолт (dropdown): нижняя шторка мобильного бургера тоже на md", () => {
    const [html] = отрисовать([{ block: "Header", props: БАЗА }]);
    expect(html).toContain("pb-8 md:hidden [clip-path:inset(0)]");
  });

  it("JS-порог поиска один — md (767.98), без атрибута режима", () => {
    const [html] = отрисовать([{ block: "Header", props: БАЗА }]);
    expect(html).toContain("767.98");
    expect(html).not.toContain("1023.98");
    expect(html).not.toContain("data-design-parity");
  });

  it("настройки шапки продолжают менять разметку: логотип, меню, липкость, отступы", () => {
    // Базовая (без явного logoPosition) уже приходит «center-absolute» —
    // это дефолт темы (theme.json blockDefaults), не наша правка; поэтому
    // «center-absolute» здесь не отдельный вариант, а сама база.
    const [исходная, ...варианты] = отрисовать([
      { block: "Header", props: БАЗА },
      { block: "Header", props: { ...БАЗА, logoPosition: "top-left" } },
      { block: "Header", props: { ...БАЗА, logoPosition: "top-center" } },
      { block: "Header", props: { ...БАЗА, logoPosition: "center-left" } },
      { block: "Header", props: { ...БАЗА, menuType: "mega-menu" } },
      { block: "Header", props: { ...БАЗА, menuType: "sidebar" } },
      { block: "Header", props: { ...БАЗА, stickiness: "always" } },
      { block: "Header", props: { ...БАЗА, stickiness: "scroll-up" } },
      { block: "Header", props: { ...БАЗА, padding: { top: 32, bottom: 32 } } },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("капса не добавилось: число uppercase-классов закреплено", () => {
    const [html] = отрисовать([{ block: "Header", props: БАЗА }]);
    expect(считатьКапс(html)).toBe(КАПС.Header);
  });
});

describe("satin Footer: верхний ряд без лишнего gap-10, подпись платформы 16px", () => {
  const БАЗА = {
    id: "Footer-1",
    colorScheme: "scheme-1",
    copyright: "© Магазин",
  };

  it("выравнивание по умолчанию — без gap-10, подпись 16px", () => {
    const [html] = отрисовать([{ block: "Footer", props: БАЗА }]);
    expect(html).not.toContain("flex items-start gap-10 md:justify-between");
    expect(html).toContain("flex items-start md:justify-between");
    expect(html).toContain("md:text-[16px]");
    expect(html).not.toContain("md:text-[14px]");
  });

  it("contentAlign=right — свой зазор не трогаем (настройка продолжает работать)", () => {
    const [html] = отрисовать([{ block: "Footer", props: { ...БАЗА, contentAlign: "right" } }]);
    expect(html).toContain("gap-10");
    // Подпись платформы не завязана на contentAlign.
    expect(html).toContain("md:text-[16px]");
  });

  it("остальные настройки по-прежнему меняют секцию", () => {
    const [исходная, ...варианты] = отрисовать([
      { block: "Footer", props: БАЗА },
      { block: "Footer", props: { ...БАЗА, contentAlign: "center" } },
      { block: "Footer", props: { ...БАЗА, padding: { top: 24, bottom: 24 } } },
      { block: "Footer", props: { ...БАЗА, phone: "+7 900 000-00-00" } },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("капса не добавилось: число uppercase-классов закреплено", () => {
    const [html] = отрисовать([{ block: "Footer", props: БАЗА }]);
    expect(считатьКапс(html)).toBe(КАПС.Footer);
  });
});

describe("satin PopularProducts: не заданный «Вид изображения» — «Квадрат» панели", () => {
  const БАЗА = { id: "PopularProducts-1", colorScheme: "scheme-1" };
  // Без "[&_" в начале: Astro отдаёт `&` динамического class-атрибута как
  // сущность `&#38;` (в статичных class="..." строках такого нет) — токен без
  // амперсанда однозначно ловит именно этот селектор-оверрайд независимо от
  // его кодировки.
  const ОВЕРРАЙД = "_li>article>div:first-child]:aspect-square";

  it("нетронутый сид (imageView отсутствует) — тот же квадрат, что явный «Квадрат»", () => {
    const [несдан, квадрат] = отрисовать([
      { block: "PopularProducts", props: БАЗА },
      { block: "PopularProducts", props: { ...БАЗА, imageView: "square" } },
    ]);
    expect(несдан).toContain(ОВЕРРАЙД);
    expect(несдан).toEqual(квадрат);
  });

  it("явный 'portrait'/'wide' — своя пропорция", () => {
    const [portrait, wide] = отрисовать([
      { block: "PopularProducts", props: { ...БАЗА, imageView: "portrait" } },
      { block: "PopularProducts", props: { ...БАЗА, imageView: "wide" } },
    ]);
    expect(portrait).not.toContain(ОВЕРРАЙД);
    expect(portrait).toContain("aspect-[430/500]");
    expect(wide).not.toContain(ОВЕРРАЙД);
    expect(wide).toContain("aspect-[16/9]");
  });

  it("капса не добавилось: число uppercase-классов закреплено", () => {
    const [html] = отрисовать([{ block: "PopularProducts", props: БАЗА }]);
    expect(считатьКапс(html)).toBe(КАПС.PopularProducts);
  });
});

/**
 * Цель «как у верстальщиков» (24.09, scripts/qa/designer-goal.ts satin):
 * шапка в одну строку, полоса объявления, основной текст, «Изображение с
 * текстом». Классы верстальщиков — ТОЛЬКО для незаданных настроек, у которых
 * в панели НЕТ значения по умолчанию.
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
 * describe ниже.
 */
describe("satin Header: «логотип по центру» — меню и иконки в той же строке", () => {
  const БАЗА = { id: "Header-1", colorScheme: "scheme-1", logoPosition: "center-absolute" };

  it("строка грида плотная (grid-flow-dense)", () => {
    const [html] = отрисовать([{ block: "Header", props: БАЗА }]);
    expect(html).toContain("grid grid-cols-[1fr_auto_1fr] grid-flow-dense");
    expect(считатьКапс(html)).toBe(КАПС.Header);
  });

  it("другие положения логотипа не трогаем", () => {
    const [html] = отрисовать([{ block: "Header", props: { ...БАЗА, logoPosition: "top-left" } }]);
    expect(html).not.toContain("grid-flow-dense");
  });
});

describe("satin PromoBanner: не заданный «Размер» — «Большой» панели", () => {
  const БАЗА = { id: "PromoBanner-1", text: "Скидка 10%", link: { text: "Перейти", href: "/catalog" } };

  it("без size — та же полоса, что «Большой» (min-h-12 / 16px), полосы верстальщика нет", () => {
    const [html, большой] = отрисовать([
      { block: "PromoBanner", props: БАЗА },
      { block: "PromoBanner", props: { ...БАЗА, size: "large" } },
    ]);
    expect(html).toEqual(большой);
    expect(html).toContain("flex min-h-12 w-full");
    expect(html).not.toContain("flex py-2 w-full");
    expect(html).not.toContain("text-[11px] md:text-[14px]");
    expect(считатьКапс(html)).toBe(КАПС.PromoBanner);
  });
});

describe("satin MultiRows: решение владельца 17–20.09 главнее геометрии верстальщика (регресс 24.09 7c87010e)", () => {
  const РЯДЫ = [
    { id: "r1", title: "Женская", description: "Текст", button: { text: "Для женщин", link: "/catalog" } },
    { id: "r2", title: "Мужская", description: "Текст", button: { text: "Для мужчин", link: "/catalog" } },
  ];
  const БАЗА = { id: "MultiRows-1", rows: РЯДЫ };

  it("пара впритык (md:gap-0), у текста md:p-8, доли ROW_SPLIT, между рядами gap-8 — геометрия верстальщика (md:grid-cols-2 md:gap-10, gap-12 md:gap-20) не рисуется", () => {
    const [html] = отрисовать([{ block: "MultiRows", props: БАЗА }]);
    expect(html).toContain("grid grid-cols-1 items-stretch gap-8 md:gap-0");
    expect(html).toContain("md:grid-cols-[3fr_2fr]");
    expect(html).toContain("md:p-8");
    expect(html).not.toContain("md:grid-cols-2 md:gap-10");
    expect(html).not.toContain("gap-12 md:gap-20");
    expect(считатьКапс(html)).toBe(КАПС.MultiRows);
  });

  it("размер текста ряда без своего значения — 16px без md: (ROW_TEXT_CLS.designers)", () => {
    const [html] = отрисовать([{ block: "MultiRows", props: БАЗА }]);
    expect(html).not.toContain("md:text-[20px]");
  });

  it("заданные «Ширина» и «Размер текста» работают как раньше", () => {
    const [ширина, текст] = отрисовать([
      { block: "MultiRows", props: { ...БАЗА, width: "small" } },
      { block: "MultiRows", props: { ...БАЗА, rows: РЯДЫ.map((r) => ({ ...r, textSize: "medium" })) } },
    ]);
    expect(ширина).toContain("md:grid-cols-[2fr_3fr]");
    expect(ширина).toContain("md:p-8");
    expect(текст).toContain("md:text-[20px]");
  });
});

describe("satin MainText: текст 16 без «Размера текста»; «Позиция» не задана — «По центру» панели", () => {
  const БАЗА = { id: "MainText-1", heading: { text: "Заголовок" }, text: { content: "Текст" } };

  it("текст верстальщика 16px, блок по центру, как «По центру»", () => {
    const [html, центр] = отрисовать([
      { block: "MainText", props: БАЗА },
      { block: "MainText", props: { ...БАЗА, position: "center" } },
    ]);
    // «Размер текста» в панели значения по умолчанию не имеет — вид
    // верстальщиков при «не задано» остаётся.
    expect(html).not.toContain("md:text-[20px]");
    // «Позиция» по умолчанию — «По центру»: блок во всю ширину влево снят.
    expect(html).toContain("mx-auto items-center text-center");
    expect(html).not.toContain("flex w-full flex-col gap-4 items-start text-left");
    expect(html).toEqual(центр);
    expect(считатьКапс(html)).toBe(КАПС.MainText);
  });

  it("выбранные позиция и размер работают как раньше", () => {
    const [центр, лево, средний] = отрисовать([
      { block: "MainText", props: { ...БАЗА, position: "center" } },
      { block: "MainText", props: { ...БАЗА, position: "left" } },
      { block: "MainText", props: { ...БАЗА, textSize: "medium" } },
    ]);
    expect(центр).toContain("mx-auto items-center text-center");
    expect(лево).toContain("max-w-[600px] mr-auto items-start text-left");
    expect(средний).toContain("md:text-[20px]");
  });
});

describe("satin ImageWithText: фото и текст встык — только без «Ширины»", () => {
  const БАЗА = { id: "ImageWithText-1", heading: { text: "Заголовок" }, image: { url: "https://example.com/a.webp" } };

  it("без «Ширины» — без зазора", () => {
    const [html] = отрисовать([{ block: "ImageWithText", props: БАЗА }]);
    expect(html).not.toContain("md:gap-x-10");
    expect(считатьКапс(html)).toBe(КАПС.ImageWithText);
  });

  it("заданная ширина держит зазор", () => {
    const [html] = отрисовать([{ block: "ImageWithText", props: { ...БАЗА, width: "large" } }]);
    expect(html).toContain("md:gap-x-10");
  });
});
