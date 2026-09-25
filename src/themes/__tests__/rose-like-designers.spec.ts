import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * rose — геометрия «как у верстальщиков».
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
 * С 25.09 у секций одна версия (владелец: «стили приравнивали, секции и
 * параметры менять не нужно было») — прежняя ветка удалена вместе с
 * признаком режима, и признак (true/false) разметку не меняет.
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

describe("rose: «Список коллекций» — отступы и зазоры как у верстальщиков", () => {
  const БАЗА = { id: "Collections-1", colorScheme: "scheme-1" };
  const [html, вкл, выкл] = отрисовать([
    { block: "Collections", props: БАЗА },
    { block: "Collections", props: { ...БАЗА, ...ВКЛ } },
    { block: "Collections", props: { ...БАЗА, ...ВЫКЛ } },
  ]);

  it("pb-20/pt-20, gap-10, сетка gap-10 sm:gap-5 md:gap-4 lg:gap-6", () => {
    expect(html).toContain("pb-20 pt-20");
    expect(html).toContain("max-w-[1320px] flex-col gap-10");
    expect(html).toContain("grid grid-cols-1 gap-10 sm:gap-5 md:gap-4 lg:gap-6");
    expect(html).not.toContain("pb-14 pt-14");
    expect(html).not.toContain("gap-8 md:gap-10");
    expect(html).not.toContain("gap-6 sm:gap-5 md:gap-5 lg:gap-6");
  });

  it("одна версия: признак режима (true, false) ничего не меняет", () => {
    expect(вкл).toEqual(html);
    expect(выкл).toEqual(html);
  });

  it("капс верстальщиков не перенесён", () => {
    expect(html).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: «Популярное» — отступы и зазоры как у верстальщиков", () => {
  const БАЗА = { id: "Popular-1", colorScheme: "scheme-1" };
  const [html, вкл, выкл] = отрисовать([
    { block: "PopularProducts", props: БАЗА },
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
    { block: "PopularProducts", props: { ...БАЗА, ...ВЫКЛ } },
  ]);

  it("pb-20/pt-20, gap-10, базовая сетка gap-x-2 gap-y-10", () => {
    expect(html).toContain("pb-20 pt-20");
    expect(html).toContain("max-w-[1320px] flex-col gap-10");
    expect(html).toContain(
      "grid w-full grid-cols-2 gap-x-2 gap-y-10 sm:gap-x-4 sm:gap-y-9 md:gap-x-4 md:gap-y-10 xl:gap-x-5",
    );
    expect(html).not.toContain("pb-14 pt-14");
    expect(html).not.toContain("gap-x-3 gap-y-8");
  });

  it("одна версия: признак режима (true, false) ничего не меняет", () => {
    expect(вкл).toEqual(html);
    expect(выкл).toEqual(html);
  });

  it("капс верстальщиков не перенесён", () => {
    expect(html).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: «Галерея» — отступы, зазоры и md-ступень сетки как у верстальщиков", () => {
  const ТРИ_ПЛИТКИ = {
    items: [
      { type: "image", url: "/images/gallery-1.webp", alt: "Фото" },
      { type: "product", productId: "p-1" },
      { type: "collection", collectionId: "c-1" },
    ],
  };
  const БАЗА = { id: "Gallery-1", colorScheme: "scheme-1", ...ТРИ_ПЛИТКИ };
  const [вкл, признакВкл, выкл, вклЗеркало] = отрисовать([
    { block: "Gallery", props: БАЗА },
    { block: "Gallery", props: { ...БАЗА, ...ВКЛ } },
    { block: "Gallery", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "Gallery", props: { ...БАЗА, imagePosition: "right" } },
  ]);

  it("pb-20/pt-20, gap-10, md-ступень сетки, большой тайл — aspect-square + md:h-full", () => {
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

  it("боковые тайлы — квадрат до lg, фикс-пропорция только с lg", () => {
    expect(вкл).toContain("lg:aspect-[429/444]");
    expect(вкл).toContain("lg:aspect-[429/309]");
  });

  it("обёртка боковых — grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-4 lg:gap-6", () => {
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

  it("одна версия: признак режима (true, false) ничего не меняет", () => {
    expect(признакВкл).toEqual(вкл);
    expect(выкл).toEqual(вкл);
  });

  it("капс верстальщиков не перенесён", () => {
    expect(вкл).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

// ---------------------------------------------------------------------------
// Header — иконка бургера мобилы
// ---------------------------------------------------------------------------

describe("rose: Header — иконка бургера мобилы size-6, как у верстальщиков", () => {
  const [вкл, признакВкл, выкл] = отрисовать([
    { block: "Header", props: { id: "Header-1" } },
    { block: "Header", props: { id: "Header-1", ...ВКЛ } },
    { block: "Header", props: { id: "Header-1", ...ВЫКЛ } },
  ]);

  /** Блок мобильной кнопки-бургера (уникальный id, без вложенных <button>). */
  const блокБургера = (html: string): string => {
    const m = html.match(/<button[^>]*id="rose-burger-btn"[\s\S]*?<\/button>/);
    expect(m).not.toBeNull();
    return m![0];
  };

  it("size-6 на кнопке и на обеих иконках, size-5 нет", () => {
    const блок = блокБургера(вкл);
    expect(блок).toContain("size-6");
    expect(блок).not.toContain("size-5");
  });

  it("одна версия: признак режима (true, false) ничего не меняет", () => {
    expect(признакВкл).toEqual(вкл);
    expect(выкл).toEqual(вкл);
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

describe("rose: Footer — дефолт-ветка «Выравнивания» переходит в 2 колонки с планшета", () => {
  const БАЗА = {
    id: "Footer-1",
    colorScheme: "scheme-1",
    phone: "+7 900 000-00-00",
    // Соцсети — нужны, чтобы отрисовался блок с contactJustifyCls (пуст без них).
    socialColumn: {
      socialLinks: [{ platform: "vk", href: "https://vk.com/shop" }],
    },
  };
  const [вклЛево, признакВклЛево, выклЛево, вклЦентр, вклСправа] = отрисовать([
    { block: "Footer", props: БАЗА },
    { block: "Footer", props: { ...БАЗА, ...ВКЛ } },
    { block: "Footer", props: { ...БАЗА, ...ВЫКЛ } },
    { block: "Footer", props: { ...БАЗА, contentAlign: "center" } },
    { block: "Footer", props: { ...БАЗА, contentAlign: "right" } },
  ]);

  it("left (дефолт): секция — md:flex-row md:items-start md:justify-between", () => {
    expect(вклЛево).toContain(
      "flex w-full flex-col gap-10 md:flex-row md:items-start md:justify-between lg:flex-row lg:items-start lg:justify-between",
    );
  });

  it("left (дефолт): обёртка nav/info — md:flex-col md:gap-10 между sm и lg", () => {
    expect(вклЛево).toContain(
      "flex flex-col gap-10 sm:flex-row sm:gap-[200px] md:flex-col md:gap-10 lg:flex-row lg:gap-[200px]",
    );
  });

  it("left (дефолт): выравнивание контактов — md:items-end md:text-right", () => {
    expect(вклЛево).toContain(
      "md:items-end md:text-right lg:items-end lg:text-right",
    );
    expect(вклЛево).toContain("md:text-right lg:text-right");
    expect(вклЛево).toContain("md:justify-end lg:justify-end");
  });

  it("одна версия: признак режима (true, false) ничего не меняет", () => {
    expect(признакВклЛево).toEqual(вклЛево);
    expect(выклЛево).toEqual(вклЛево);
  });

  it("center/right — у верстальщиков своей раскладки нет, остаются своими (две колонки с lg)", () => {
    expect(вклЦентр).toContain(
      "flex w-full flex-col gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-24",
    );
    expect(вклСправа).toContain(
      "flex w-full flex-col gap-10 lg:flex-row lg:items-start lg:justify-end",
    );
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

describe("rose: Hero — первый экран как у верстальщиков", () => {
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

  it("размер по умолчанию — «Большой»: оверлей на всех ширинах, пропорция верстальщиков", () => {
    const [html] = отрисовать([{ block: "Hero", props: ПОЛНАЯ }]);
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

  it("«Размер: Средний»/«Маленький» — та же пропорция ниже в 0,8/0,6 раза", () => {
    const [средний, маленький] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, size: "medium" } },
      { block: "Hero", props: { ...ПОЛНАЯ, size: "small" } },
    ]);
    expect(средний).toContain(
      "min-h-[calc((100svh-92px)*0.8)] sm:min-h-[calc((100svh-92px)*0.8)] md:min-h-[calc((100svh-104px)*0.8)] lg:min-h-[368px] aspect-[10/12] sm:aspect-[4/4] md:aspect-[4/2.4] lg:aspect-[16/7.2] xl:aspect-[2/0.8] 2xl:aspect-[21/7.2]",
    );
    expect(маленький).toContain(
      "min-h-[calc((100svh-92px)*0.6)] sm:min-h-[calc((100svh-92px)*0.6)] md:min-h-[calc((100svh-104px)*0.6)] lg:min-h-[276px] aspect-[10/9] sm:aspect-[4/3] md:aspect-[4/1.8] lg:aspect-[16/5.4] xl:aspect-[2/0.6] 2xl:aspect-[21/5.4]",
    );
  });

  it("«Затемнение» видно на всех ширинах (текст оверлеем везде)", () => {
    const [html] = отрисовать([{ block: "Hero", props: { ...ПОЛНАЯ, overlay: 50 } }]);
    expect(html).toContain('bg-black block"');
    expect(html).not.toContain("hidden md:block");
  });

  it("остальные настройки по-прежнему меняют секцию (Позиция/Выравнивание/Контейнер/Кнопки)", () => {
    const база = ПОЛНАЯ;
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

  it("два фото — раскладка 50/50 (grid-cols-2) с кадрированием", () => {
    const дваФото = {
      ...ПОЛНАЯ,
      backgroundImages: { url1: ФОТО, url2: ФОТО2 },
    };
    const [два] = отрисовать([{ block: "Hero", props: дваФото }]);
    expect(два).toContain("grid grid-cols-2");
    expect(два).toContain("object-cover");
  });

  it("одна версия: признак режима (true, false) ничего не меняет — ни у фото, ни у пустого", () => {
    const пусто = { id: "Hero-1", colorScheme: "scheme-1" };
    const [html, вкл, выкл, пустое, пустоеВкл, пустоеВыкл] = отрисовать([
      { block: "Hero", props: ПОЛНАЯ },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ } },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВЫКЛ } },
      { block: "Hero", props: пусто },
      { block: "Hero", props: { ...пусто, ...ВКЛ } },
      { block: "Hero", props: { ...пусто, ...ВЫКЛ } },
    ]);
    expect(вкл).toEqual(html);
    expect(выкл).toEqual(html);
    expect(пустоеВкл).toEqual(пустое);
    expect(пустоеВыкл).toEqual(пустое);
    // Прежнего мобильного стека «фото сверху, подложка снизу» нет.
    expect(html).not.toContain("aspect-[4/3] w-full md:absolute");
  });

  it("капс верстальщиков не перенесён", () => {
    const [html] = отрисовать([{ block: "Hero", props: ПОЛНАЯ }]);
    expect(html).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});

describe("rose: пустой первый экран — высота как у верстальщиков", () => {
  const пусто = { id: "Hero-1", colorScheme: "scheme-1" };
  const [html] = renderSections("rose", [
    { block: "Hero", props: пусто, catalog: {} },
  ]).map((r) => r.html ?? "");

  it("пропорции и высота от экрана как у верстальщиков, прежней лестницы высот нет", () => {
    expect(html).toContain("min-h-[calc(100svh-92px)]");
    expect(html).toContain("2xl:aspect-[21/9]");
    expect(html).toContain("landscape-image.png");
    expect(html).not.toContain("min-h-[min(46svh,320px)]");
  });
});
