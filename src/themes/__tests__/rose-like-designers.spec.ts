import { renderSections } from "../../../scripts/qa/lib/render";
import { ROSE_FOOTER_DESIGNERS } from "../../../themes/rose/src/lib/design-parity";

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
 * rose — геометрия «как у верстальщиков» под PARITY_DESIGN.
 *
 * Владелец 23-24.09: «делать как верстальщики, актуально, в точности»,
 * «не сломай цветовые схемы, ничего не сломай, нужно только стили, базовые».
 * Эталон — Rose-theme @b719c193 (Merfy-Dropshipping-Platform/rose-theme, ветка
 * main, актуальный на 24.09):
 *   «Список коллекций»/«Популярное»/«Галерея»: мобильные pb-14/pt-14 → pb-20/pt-20,
 *     обёртка gap-8 md:gap-10 → gap-10, свои базовые сетки (Collections: gap-6
 *     sm:gap-5 md:gap-5 lg:gap-6 → gap-10 sm:gap-5 md:gap-4 lg:gap-6; Popular:
 *     gap-x-3 gap-y-8 → gap-x-2 gap-y-10; Gallery: md-ступень сетки
 *     minmax(200px,260px), большой тайл min-h-[280px] → aspect-square + md:h-full,
 *     боковые тайлы — квадрат до lg, фикс-пропорция только с lg, обёртка боковых
 *     flex flex-col gap-6 → grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-4
 *     lg:gap-6);
 *   Header: иконка бургера мобилы size-5 → size-6 (без отдельного планшетного
 *     яруса — владелец велел его не делать);
 *   Footer: дефолт-ветка «Выравнивания» (left) переходит в 2 колонки уже с
 *     планшета (не с lg), обёртка nav/info между sm и lg снова колонкой,
 *     выравнивание блока контактов сдвигается на md; «По центру»/«Справа» —
 *     у верстальщиков своей раскладки нет, остаются прежними;
 *   Hero (первый экран, владелец одобрил «как у верстальщиков»): фото оверлеем
 *     под текстом на ВСЕХ ширинах (не только стек-на-мобиле), высота секции —
 *     их min-h+aspect-ratio по брейкпоинтам; «Размер»: «Большой» = пропорция
 *     верстальщиков дословно, «Средний»/«Маленький» — та же пропорция ниже в
 *     0,8/0,6 раза; затемнение теперь видно и на мобиле (текст оверлеем везде);
 *     позиция/выравнивание/контейнер/кнопки/два фото/пустое состояние — без
 *     изменений.
 * Капс верстальщиков не переносим (владелец 13.09 велел его убрать везде).
 * Без признака (или __designParity:false) разметка байт-в-байт прежняя.
 */

jest.setTimeout(60_000);

const ВКЛ = { __designParity: true };
const ВЫКЛ = { __designParity: false };

function отрисовать(
  jobs: Array<{ block: string; props: Record<string, unknown> }>,
): string[] {
  return renderSections(
    "rose",
    jobs.map((j) => ({ block: j.block, props: j.props })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

// ---------------------------------------------------------------------------
// «Список коллекций» / «Популярное» / «Галерея»
// ---------------------------------------------------------------------------

describe("rose: «Список коллекций» — отступы и зазоры как у верстальщиков под PARITY_DESIGN", () => {
  const БАЗА = { id: "Collections-1", colorScheme: "scheme-1" };
  const [вкл, выкл, безПризнака] = отрисовать([
    { block: "Collections", props: { ...БАЗА, ...ВКЛ } },
    { block: "Collections", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "Collections", props: БАЗА },
  ]);

  it("с признаком: pb-20/pt-20, gap-10, сетка gap-10 sm:gap-5 md:gap-4 lg:gap-6", () => {
    expect(вкл).toContain("pb-20 pt-20");
    expect(вкл).toContain("max-w-[1320px] flex-col gap-10");
    expect(вкл).toContain("grid grid-cols-1 gap-10 sm:gap-5 md:gap-4 lg:gap-6");
    expect(вкл).not.toContain("pb-14 pt-14");
    expect(вкл).not.toContain("gap-8 md:gap-10");
    expect(вкл).not.toContain("gap-6 sm:gap-5 md:gap-5 lg:gap-6");
  });

  it("без признака: прежняя разметка, __designParity:false совпадает с отсутствием признака", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).not.toEqual(вкл);
    expect(выкл).toContain("pb-14 pt-14");
    expect(выкл).toContain("gap-8 md:gap-10");
    expect(выкл).toContain("grid grid-cols-1 gap-6 sm:gap-5 md:gap-5 lg:gap-6");
  });

  it("капс верстальщиков не перенесён", () => {
    expect(вкл).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: «Популярное» — отступы и зазоры как у верстальщиков под PARITY_DESIGN", () => {
  const БАЗА = { id: "Popular-1", colorScheme: "scheme-1" };
  const [вкл, выкл, безПризнака] = отрисовать([
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
    { block: "PopularProducts", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "PopularProducts", props: БАЗА },
  ]);

  it("с признаком: pb-20/pt-20, gap-10, базовая сетка gap-x-2 gap-y-10", () => {
    expect(вкл).toContain("pb-20 pt-20");
    expect(вкл).toContain("max-w-[1320px] flex-col gap-10");
    expect(вкл).toContain(
      "grid w-full grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-4 sm:gap-y-9 md:gap-x-4 md:gap-y-10 xl:gap-x-5",
    );
    expect(вкл).not.toContain("pb-14 pt-14");
    expect(вкл).not.toContain("gap-x-3 gap-y-8");
  });

  it("без признака: прежняя разметка, __designParity:false совпадает с отсутствием признака", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).not.toEqual(вкл);
    expect(выкл).toContain("pb-14 pt-14");
    expect(выкл).toContain("gap-x-3 gap-y-8");
  });

  it("капс верстальщиков не перенесён", () => {
    expect(вкл).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: «Галерея» — отступы, зазоры и md-ступень сетки как у верстальщиков под PARITY_DESIGN", () => {
  const ТРИ_ПЛИТКИ = {
    items: [
      { type: "image", url: "/images/gallery-1.webp", alt: "Фото" },
      { type: "product", productId: "p-1" },
      { type: "collection", collectionId: "c-1" },
    ],
  };
  const БАЗА = { id: "Gallery-1", colorScheme: "scheme-1", ...ТРИ_ПЛИТКИ };
  const [вкл, выкл, безПризнака, вклЗеркало] = отрисовать([
    { block: "Gallery", props: { ...БАЗА, ...ВКЛ } },
    { block: "Gallery", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "Gallery", props: БАЗА },
    { block: "Gallery", props: { ...БАЗА, ...ВКЛ, imagePosition: "right" } },
  ]);

  it("с признаком: pb-20/pt-20, gap-10, md-ступень сетки, большой тайл — aspect-square + md:h-full", () => {
    expect(вкл).toContain("pb-20 pt-20");
    expect(вкл).toContain("max-w-[1320px] flex-col gap-10");
    expect(вкл).toContain(
      "md:grid-cols-[minmax(0,1fr)_minmax(200px,260px)] md:items-stretch md:gap-4",
    );
    expect(вкл).toContain("aspect-square");
    expect(вкл).toContain("md:h-full lg:min-h-0 lg:h-full");
    expect(вкл).not.toContain("min-h-[280px]");
    expect(вкл).not.toContain("pb-14 pt-14");
  });

  it("с признаком: боковые тайлы — квадрат до lg, фикс-пропорция только с lg", () => {
    expect(вкл).toContain("lg:aspect-[429/444]");
    expect(вкл).toContain("lg:aspect-[429/309]");
  });

  it("с признаком: обёртка боковых — grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-4 lg:gap-6", () => {
    expect(вкл).toContain(
      "grid grid-cols-2 gap-2 min-h-0 min-w-0 md:flex md:flex-col md:gap-4 lg:gap-6",
    );
    expect(вкл).not.toContain("flex min-h-0 min-w-0 flex-col gap-6");
  });

  it("«Позиция изображения: справа» — та же md-ступень, зеркалом", () => {
    expect(вклЗеркало).toContain(
      "md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]",
    );
    expect(вклЗеркало).not.toEqual(вкл);
  });

  it("без признака: прежняя разметка, __designParity:false совпадает с отсутствием признака", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).not.toEqual(вкл);
    expect(выкл).toContain("pb-14 pt-14");
    expect(выкл).toContain("min-h-[280px]");
    expect(выкл).toContain("aspect-[429/444]");
    expect(выкл).not.toContain("aspect-square");
  });

  it("капс верстальщиков не перенесён", () => {
    expect(вкл).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

// ---------------------------------------------------------------------------
// Header — иконка бургера мобилы
// ---------------------------------------------------------------------------

describe("rose: Header — иконка бургера мобилы size-5 → size-6 под PARITY_DESIGN", () => {
  const [вкл, выкл, безПризнака] = отрисовать([
    { block: "Header", props: { id: "Header-1", ...ВКЛ } },
    { block: "Header", props: { id: "Header-1", ...ВЫКЛ } },
    { block: "Header", props: { id: "Header-1" } },
  ]);

  /** Блок мобильной кнопки-бургера (уникальный id, без вложенных <button>). */
  const блокБургера = (html: string): string => {
    const m = html.match(/<button[^>]*id="rose-burger-btn"[\s\S]*?<\/button>/);
    expect(m).not.toBeNull();
    return m![0];
  };

  it("с признаком: size-6 на кнопке и на обеих иконках, size-5 нет", () => {
    const блок = блокБургера(вкл);
    expect(блок).toContain("size-6");
    expect(блок).not.toContain("size-5");
  });

  it("без признака: прежний size-5, __designParity:false совпадает с отсутствием признака", () => {
    expect(выкл).toEqual(безПризнака);
    const блок = блокБургера(выкл);
    expect(блок).toContain("size-5");
    expect(блок).not.toContain("size-6");
  });

  it("отдельный планшетный ярус шапки не появился (одна мобильная строка, а не две)", () => {
    // У верстальщиков отдельный блок "Tablet: 768–1023" — с md:flex md:hidden lg:hidden.
    // Мы его не переносим: под lg остаётся ровно один блок мобильной строки.
    expect(вкл).not.toContain("md:flex md:px-10 lg:hidden");
  });
});

// ---------------------------------------------------------------------------
// Footer — переход в 2 колонки с планшета (дефолт-ветка выравнивания)
// ---------------------------------------------------------------------------

describe("rose: Footer — дефолт-ветка «Выравнивания» переходит в 2 колонки с планшета под PARITY_DESIGN", () => {
  const БАЗА = {
    id: "Footer-1",
    colorScheme: "scheme-1",
    phone: "+7 900 000-00-00",
    // Соцсети — нужны, чтобы отрисовался блок с contactJustifyCls (пуст без них).
    socialColumn: {
      socialLinks: [{ platform: "vk", href: "https://vk.com/shop" }],
    },
  };
  const [
    вклЛево,
    выклЛево,
    безПризнакаЛево,
    вклЦентр,
    выклЦентр,
    вклСправа,
    выклСправа,
  ] = отрисовать([
    { block: "Footer", props: { ...БАЗА, ...ВКЛ } },
    { block: "Footer", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "Footer", props: БАЗА },
    { block: "Footer", props: { ...БАЗА, ...ВКЛ, contentAlign: "center" } },
    { block: "Footer", props: { ...БАЗА, ...ВЫКЛ, contentAlign: "center" } },
    { block: "Footer", props: { ...БАЗА, ...ВКЛ, contentAlign: "right" } },
    { block: "Footer", props: { ...БАЗА, ...ВЫКЛ, contentAlign: "right" } },
  ]);

  it("left (дефолт) с признаком: секция — md:flex-row md:items-start md:justify-between", () => {
    expect(вклЛево).toContain(
      "flex w-full flex-col gap-10 md:flex-row md:items-start md:justify-between lg:flex-row lg:items-start lg:justify-between",
    );
  });

  it("left (дефолт) с признаком: обёртка nav/info — md:flex-col md:gap-10 между sm и lg", () => {
    expect(вклЛево).toContain(
      "flex flex-col gap-10 sm:flex-row sm:gap-[200px] md:flex-col md:gap-10 lg:flex-row lg:gap-[200px]",
    );
  });

  it("left (дефолт) с признаком: выравнивание контактов — md:items-end md:text-right", () => {
    expect(вклЛево).toContain(
      "md:items-end md:text-right lg:items-end lg:text-right",
    );
    expect(вклЛево).toContain("md:text-right lg:text-right");
    expect(вклЛево).toContain("md:justify-end lg:justify-end");
  });

  it("left (дефолт) без признака: прежняя разметка, __designParity:false совпадает с отсутствием признака", () => {
    expect(выклЛево).toEqual(безПризнакаЛево);
    expect(выклЛево).not.toEqual(вклЛево);
    expect(выклЛево).not.toContain(
      "md:flex-row md:items-start md:justify-between",
    );
    expect(выклЛево).not.toContain("md:flex-col md:gap-10");
    expect(выклЛево).not.toContain("md:items-end md:text-right");
  });

  it("center/right — у верстальщиков своей раскладки нет, признак их не трогает", () => {
    // Раскладка center/right прежняя; признак меняет только кегли (заголовок
    // рассылки, ссылки на телефоне — rose-goal-sizes.spec.ts), их и вычитаем.
    const безКеглей = (html: string) =>
      html
        .replace(/&#38;/g, "&")
        .replace(` ${ROSE_FOOTER_DESIGNERS.link}`, "")
        .replace(` ${ROSE_FOOTER_DESIGNERS.newsletter}`, "")
        .replace(/style="--size-section-heading:[^"]*"/, 'style="…"');
    expect(безКеглей(вклЦентр)).toEqual(безКеглей(выклЦентр));
    expect(безКеглей(вклСправа)).toEqual(безКеглей(выклСправа));
    expect(вклЦентр).not.toContain("md:flex-row md:items-start md:justify-between");
    expect(вклСправа).not.toContain("md:flex-row md:items-start md:justify-between");
  });

  it("капс верстальщиков не перенесён", () => {
    expect(вклЛево).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

// ---------------------------------------------------------------------------
// Hero — первый экран: оверлей на всех ширинах вместо стека на мобиле
// ---------------------------------------------------------------------------

describe("rose: Hero — первый экран как у верстальщиков под PARITY_DESIGN", () => {
  const ФОТО = "/images/hero-photo.webp";
  const ФОТО2 = "/images/hero-background.webp";
  const ПОЛНАЯ = {
    id: "Hero-1",
    colorScheme: "scheme-1",
    heading: { text: "Заголовок" },
    text: { content: "Текст" },
    backgroundImages: { url1: ФОТО },
  };

  /** Блок мобильной кнопки-бургера — не нужен здесь; переиспользуем паттерн секции. */
  const блокСекции = (html: string): string => {
    const m = html.match(/<section[\s\S]*?<\/section>/);
    expect(m).not.toBeNull();
    return m![0];
  };

  it("с признаком (размер по умолчанию — «Большой»): оверлей на всех ширинах, пропорция верстальщиков", () => {
    const [html] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ } },
    ]);
    const секция = блокСекции(html);
    expect(секция).toContain(
      "min-h-[calc(100svh-92px)] sm:min-h-[calc(100svh-92px)] md:min-h-[calc(100svh-104px)] lg:min-h-[460px] aspect-[10/15] sm:aspect-[4/5] md:aspect-[4/3] lg:aspect-[16/9] xl:aspect-[2/1] 2xl:aspect-[21/9]",
    );
    expect(секция).toContain('<div class="absolute inset-0 z-0">');
    expect(секция).not.toContain("aspect-[4/3] w-full md:absolute");
    expect(секция).not.toContain(
      "md:min-h-[560px] lg:min-h-[600px] xl:min-h-[640px]",
    );
  });

  it("«Размер: Средний»/«Маленький» с признаком — та же пропорция ниже в 0,8/0,6 раза", () => {
    const [средний, маленький] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ, size: "medium" } },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ, size: "small" } },
    ]);
    expect(средний).toContain(
      "min-h-[calc((100svh-92px)*0.8)] sm:min-h-[calc((100svh-92px)*0.8)] md:min-h-[calc((100svh-104px)*0.8)] lg:min-h-[368px] aspect-[10/12] sm:aspect-[4/4] md:aspect-[4/2.4] lg:aspect-[16/7.2] xl:aspect-[2/0.8] 2xl:aspect-[21/7.2]",
    );
    expect(маленький).toContain(
      "min-h-[calc((100svh-92px)*0.6)] sm:min-h-[calc((100svh-92px)*0.6)] md:min-h-[calc((100svh-104px)*0.6)] lg:min-h-[276px] aspect-[10/9] sm:aspect-[4/3] md:aspect-[4/1.8] lg:aspect-[16/5.4] xl:aspect-[2/0.6] 2xl:aspect-[21/5.4]",
    );
  });

  it("«Затемнение» видно на всех ширинах с признаком (было — только с md)", () => {
    const [вкл, выкл] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ, overlay: 50 } },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВЫКЛ, overlay: 50 } },
    ]);
    expect(вкл).toContain('bg-black block"');
    expect(вкл).not.toContain("hidden md:block");
    expect(выкл).toContain('bg-black hidden md:block"');
  });

  it("остальные настройки по-прежнему меняют секцию (Позиция/Выравнивание/Контейнер/Кнопки)", () => {
    const база = { ...ПОЛНАЯ, ...ВКЛ };
    const [исходная, ...варианты] = отрисовать([
      { block: "Hero", props: база },
      { block: "Hero", props: { ...база, position: "top-left" } },
      { block: "Hero", props: { ...база, alignment: "left" } },
      { block: "Hero", props: { ...база, container: "true" } },
      { block: "Hero", props: { ...база, size: "small" } },
      {
        block: "Hero",
        props: {
          ...база,
          secondaryButton: { text: "Подробнее", link: "/about" },
        },
      },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("два фото не меняются признаком, пустое состояние — только высотой", () => {
    const дваФото = {
      ...ПОЛНАЯ,
      backgroundImages: { url1: ФОТО, url2: ФОТО2 },
    };
    const пусто = { id: "Hero-1", colorScheme: "scheme-1" };
    const [дваВкл, дваВыкл, пустоВкл, пустоВыкл] = отрисовать([
      { block: "Hero", props: { ...дваФото, ...ВКЛ } },
      { block: "Hero", props: дваФото },
      { block: "Hero", props: { ...пусто, ...ВКЛ } },
      { block: "Hero", props: пусто },
    ]);
    expect(дваВкл).toContain("grid grid-cols-2");
    expect(дваВкл).toContain("object-cover");
    // Пустое состояние отличается ТОЛЬКО высотой блока (см. отдельный
    // describe ниже): у нового магазина первый экран именно такой.
    const безВысоты = (html: string) =>
      html.replace(
        /<div class="relative w-full [^"]*"/,
        '<div class="relative w-full"',
      );
    expect(безВысоты(пустоВкл)).toEqual(безВысоты(пустоВыкл));
    // Два фото: признак не переносит оверлей-геометрию на мобиль-стек 4/3 —
    // единственная разница — контейнер секции (высота/оверлей), сама раскладка
    // 50/50 (grid-cols-2 внутри) остаётся прежней у обоих.
    expect(дваВкл.includes("grid grid-cols-2")).toBe(
      дваВыкл.includes("grid grid-cols-2"),
    );
  });

  it("без признака (или __designParity:false): разметка байт-в-байт прежняя", () => {
    const [безПризнака, признакВыкл] = отрисовать([
      { block: "Hero", props: ПОЛНАЯ },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВЫКЛ } },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(безПризнака).toContain("aspect-[4/3] w-full md:absolute");
  });

  it("капс верстальщиков не перенесён", () => {
    const [html] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ } },
    ]);
    expect(html).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: пустой первый экран — высота как у верстальщиков под PARITY_DESIGN", () => {
  const пусто = { id: "Hero-1", colorScheme: "scheme-1" };
  const [вкл, выкл, безПризнака] = renderSections("rose", [
    { block: "Hero", props: { ...пусто, __designParity: true }, catalog: {} },
    { block: "Hero", props: пусто, catalog: {} },
    { block: "Hero", props: { ...пусто, __designParity: false }, catalog: {} },
  ]).map((r) => r.html ?? "");

  it("с признаком — пропорции и высота от экрана как у верстальщиков", () => {
    expect(вкл).toContain("min-h-[calc(100svh-92px)]");
    expect(вкл).toContain("2xl:aspect-[21/9]");
    expect(вкл).toContain("landscape-image.png");
  });

  it("без признака — прежняя лестница высот, разметка та же", () => {
    expect(выкл).toContain("min-h-[min(46svh,320px)]");
    expect(выкл).not.toContain("min-h-[calc(100svh-92px)]");
    expect(безПризнака).toEqual(выкл);
  });
});
