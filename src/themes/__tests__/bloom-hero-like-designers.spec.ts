import { renderSections } from "../../../scripts/qa/lib/render";
import { prepareBlockProps } from "../page-blocks";

/**
 * Первый экран bloom — как в актуальной вёрстке верстальщиков.
 *
 * Владелец 23.09 прислал два снимка: bloom.merfy.ru и свой сайт. У
 * верстальщиков фото вписано по высоте блока, и лицо видно целиком. У нас фото
 * заливает блок, как обои, поэтому оно в 2,3 раза крупнее, и видны только
 * глаза и нос. Замер: при окне 1920 у верстальщиков фото ×0,43 и видно 90% его
 * высоты, у нас ×1,00 и 30%.
 *
 * Эталон — Bloom-theme `src/components/sections/Hero.astro` @ 5aae2ad6
 * (правка верстальщиков 8058391 от 14.06, «adaptive hero per Figma»):
 *   блок: min-h-[560px] aspect-[375/716] sm:aspect-[768/968]
 *         md:aspect-[1280/968] xl:aspect-[1920/925]
 *   фото: absolute left-0 top-0 h-[122%] w-auto max-w-none
 *         md:left-1/2 md:h-[111.45%] md:-translate-x-1/2
 *
 * Владелец: «только стили, ничего не сломать». Поэтому:
 *   - меняется только геометрия: пропорция блока и вписывание одного фото;
 *   - «Размер» продолжает работать: «Большой» = пропорция верстальщиков,
 *     «Средний» и «Маленький» — та же пропорция, ниже в 0,8 и 0,6 раза
 *     (как соотносились прежние высоты 620 / 500 / 380);
 *   - два фото, пустое состояние, затемнение, положение, выравнивание,
 *     контейнер, кнопки и цвета из схемы — без изменений;
 *   - без выключателя PARITY_DESIGN разметка байт в байт прежняя.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ФОТО = "/images/hero-photo.webp";
const ФОТО2 = "/images/hero-background.webp";
const ПОЛНАЯ = {
  id: "Hero-1",
  colorScheme: "scheme-1",
  heading: { text: "Заголовок" },
  text: { content: "Текст" },
  backgroundImages: { url1: ФОТО },
};
const КАК_У_ВЕРСТАЛЬЩИКОВ = { __designParity: true };
/** Текстовый блок первого экрана: [у верстальщиков, прежнее]. */
const ТЕКСТ_ВЕРСТАЛЬЩИКОВ: [string, string][] = [
  ["text-[14px] font-normal leading-normal hero-over-photo-heading md:text-[20px]", "text-[18px] font-normal leading-none hero-over-photo-heading md:text-[20px]"],
  ["text-[12px] font-light leading-normal hero-over-photo-text md:text-[16px]", "text-[14px] font-light leading-[1.2] hero-over-photo-text md:text-[16px]"],
  [" pb-20 md:px-20", " pb-8 md:px-20"],
  ["max-w-[330px] md:max-w-[410px] md:py-10 md:pr-10 flex-col items-start gap-8", "max-w-[330px] flex-col items-start gap-4"],
  ["h-10 md:h-12", "h-12"],
  ["px-3 md:px-4", "px-4"],
  ["text-[14px] md:text-[16px]", "text-[16px]"],
];

function отрисовать(props: Record<string, unknown>[]): string[] {
  return renderSections(
    "bloom",
    props.map((p) => ({ block: "Hero", props: p, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(r.error);
    return r.html ?? "";
  });
}

/** Классы тега <img>, у которого src — наше фото. */
function классыФото(html: string, src = ФОТО): string {
  const тег = [...html.matchAll(/<img\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.includes(src));
  expect(тег).toBeDefined();
  return (тег!.match(/class="([^"]*)"/)?.[1] ?? "").trim();
}

/** Классы блока высоты: div с «relative w-full» и пропорцией или min-h. */
function классыБлока(html: string): string {
  const m = html.match(/<div class="(relative w-full (?:min-h|aspect)[^"]*)"/);
  expect(m).not.toBeNull();
  return m![1];
}

const БОЛЬШОЙ = [
  "min-h-[560px]",
  "aspect-[375/716]",
  "sm:aspect-[768/968]",
  "md:aspect-[1280/968]",
  "xl:aspect-[1920/925]",
];
const СРЕДНИЙ = [
  "min-h-[448px]",
  "aspect-[375/573]",
  "sm:aspect-[768/774]",
  "md:aspect-[1280/774]",
  "xl:aspect-[1920/740]",
];
const МАЛЕНЬКИЙ = [
  "min-h-[336px]",
  "aspect-[375/430]",
  "sm:aspect-[768/581]",
  "md:aspect-[1280/581]",
  "xl:aspect-[1920/555]",
];

describe("bloom, первый экран: как у верстальщиков под PARITY_DESIGN", () => {
  it("фото вписано по высоте, а не заливает блок", () => {
    const [html] = отрисовать([{ ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ }]);
    const фото = классыФото(html).split(/\s+/);
    for (const к of [
      "absolute",
      "left-0",
      "top-0",
      "h-[122%]",
      "w-auto",
      "max-w-none",
      "md:left-1/2",
      "md:h-[111.45%]",
      "md:-translate-x-1/2",
    ]) {
      expect(фото).toContain(к);
    }
    expect(фото).not.toContain("object-cover");
    expect(фото).not.toContain("size-full");
  });

  it("своё фото мерчанта заполняет блок (тестер 24.09: полосы по бокам)", () => {
    const [html] = отрисовать([
      { ...ПОЛНАЯ, backgroundImages: { url1: "https://minio.merfy.ru/media/own-photo.jpg" }, ...КАК_У_ВЕРСТАЛЬЩИКОВ },
    ]);
    const фото = классыФото(html, "https://minio.merfy.ru/media/own-photo.jpg").split(/\s+/);
    expect(фото).toContain("object-cover");
    expect(фото).toContain("size-full");
    expect(фото).not.toContain("h-[122%]");
    // Высота блока — верстальщиков и со своим фото.
    expect(классыБлока(html)).toContain("aspect-[375/716]");
  });

  it("«Размер» по умолчанию и «Большой» — пропорция верстальщиков", () => {
    const [поУмолчанию, большой] = отрисовать([
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ },
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ, size: "large" },
    ]);
    for (const html of [поУмолчанию, большой]) {
      const блок = классыБлока(html).split(/\s+/);
      for (const к of БОЛЬШОЙ) expect(блок).toContain(к);
    }
  });

  it("«Средний» и «Маленький» — та же пропорция, ниже в 0,8 и 0,6 раза", () => {
    const [средний, маленький] = отрисовать([
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ, size: "medium" },
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ, size: "small" },
    ]);
    const с = классыБлока(средний).split(/\s+/);
    const м = классыБлока(маленький).split(/\s+/);
    for (const к of СРЕДНИЙ) expect(с).toContain(к);
    for (const к of МАЛЕНЬКИЙ) expect(м).toContain(к);
  });

  it("остальные настройки по-прежнему меняют секцию", () => {
    const база = { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ };
    const [исходная, ...варианты] = отрисовать([
      база,
      { ...база, position: "top-right" },
      { ...база, alignment: "center" },
      { ...база, container: "true" },
      { ...база, overlay: 50 },
      { ...база, size: "small" },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("два фото и пустое состояние не меняются", () => {
    const дваФото = {
      ...ПОЛНАЯ,
      backgroundImages: { url1: ФОТО, url2: ФОТО2 },
    };
    const пусто = { id: "Hero-1", colorScheme: "scheme-1" };
    const [дваВкл, дваВыкл, пустоВкл, пустоВыкл] = отрисовать([
      { ...дваФото, ...КАК_У_ВЕРСТАЛЬЩИКОВ },
      дваФото,
      { ...пусто, ...КАК_У_ВЕРСТАЛЬЩИКОВ },
      пусто,
    ]);
    // Две половины заливают свои колонки, как раньше.
    expect(классыФото(дваВкл, ФОТО)).toContain("object-cover");
    expect(классыФото(дваВкл, ФОТО2)).toContain("object-cover");
    // Отличаются только высота блока («Размер»), подложка для читаемости (её
    // затемнение с признаком — как у верстальщиков, только на телефоне) и
    // текстовый блок (кегли, колонка 330 → md 410, кнопка 40 → md 48 — 24.09,
    // bloom-goal-like-designers.spec.ts). Раскладка двух фото — прежняя.
    const безТекстаВерстальщиков = (html: string) =>
      ТЕКСТ_ВЕРСТАЛЬЩИКОВ.reduce((h, [их, наше]) => h.split(их).join(наше), html);
    const безПодложки = (html: string) =>
      безТекстаВерстальщиков(html)
        .replace(
          "from-black/75 via-black/40 via-40% to-transparent md:hidden",
          "",
        )
        .replace("from-black/45 to-black/10", "")
        .replace("2xl:px-[max(300px,calc(50%_-_660px))]", "2xl:px-[300px]");
    expect(безПодложки(дваВкл.replace(классыБлока(дваВкл), ""))).toEqual(
      безПодложки(дваВыкл.replace(классыБлока(дваВыкл), "")),
    );
    const безКолонки = (html: string) =>
      безТекстаВерстальщиков(html).replace("2xl:px-[max(300px,calc(50%_-_660px))]", "2xl:px-[300px]");
    expect(безКолонки(пустоВкл.replace(классыБлока(пустоВкл), ""))).toEqual(
      пустоВыкл.replace(классыБлока(пустоВыкл), ""),
    );
  });

  it("на мониторах шире 1920 текст в колонке 1320 по центру, как остальные секции", () => {
    const [вкл, выкл] = отрисовать([{ ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ }, ПОЛНАЯ]);
    expect(вкл).toContain("2xl:px-[max(300px,calc(50%_-_660px))]");
    expect(вкл).not.toContain("2xl:px-[300px]");
    expect(выкл).toContain("2xl:px-[300px]");
  });

  it("без выключателя разметка прежняя: фото заливает блок, высота лестницей", () => {
    const [безПризнака, признакВыкл] = отрисовать([
      ПОЛНАЯ,
      { ...ПОЛНАЯ, __designParity: false },
    ]);
    expect(признакВыкл).toEqual(безПризнака);
    expect(классыФото(безПризнака)).toContain("object-cover");
    expect(классыБлока(безПризнака)).toContain("min-h-[min(80svh,620px)]");
    expect(классыБлока(безПризнака)).not.toContain("aspect-");
  });
});

describe("PARITY_DESIGN доходит до секции через общую подготовку пропсов", () => {
  const ctx = { publicUrl: null, siteId: "site-A", themeBlocks: {} };
  const было = process.env.PARITY_DESIGN;
  afterEach(() => {
    if (было === undefined) delete process.env.PARITY_DESIGN;
    else process.env.PARITY_DESIGN = было;
  });

  it("сайт из списка получает признак", () => {
    process.env.PARITY_DESIGN = "site-B,site-A";
    expect(prepareBlockProps("Hero", {}, ctx).__designParity).toBe(true);
  });

  it("сайт вне списка и выключенный выключатель признака не получают", () => {
    process.env.PARITY_DESIGN = "site-B";
    expect(prepareBlockProps("Hero", {}, ctx)).not.toHaveProperty(
      "__designParity",
    );
    process.env.PARITY_DESIGN = "off";
    expect(prepareBlockProps("Hero", {}, ctx)).not.toHaveProperty(
      "__designParity",
    );
    delete process.env.PARITY_DESIGN;
    expect(prepareBlockProps("Hero", {}, ctx)).not.toHaveProperty(
      "__designParity",
    );
  });

  it("«*» — для всех", () => {
    process.env.PARITY_DESIGN = "*";
    expect(prepareBlockProps("Hero", {}, ctx).__designParity).toBe(true);
  });
});

describe("bloom, первый экран: затемнение только из ползунка", () => {
  // Владелец 25.09: «в зависимости от настройки затемнения, если 0 — то и там и
  // там светло». Постоянной подложки (раньше: градиент на весь блок без признака,
  // градиент только на телефоне с признаком) больше нет ни в одном режиме —
  // затемнение даёт только ползунок «Затемнение», одинаково на всех ширинах.
  it("постоянного градиента нет ни с признаком, ни без", () => {
    const [вкл, выкл] = отрисовать([
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ },
      ПОЛНАЯ,
    ]);
    for (const html of [вкл, выкл]) {
      expect(html).not.toContain("from-black/75 via-black/40");
      expect(html).not.toContain("from-black/45 to-black/10");
    }
  });

  it("ползунок «Затемнение» по-прежнему работает с признаком", () => {
    // У bloom «Затемнение» по умолчанию уже задано темой — сравниваем два значения.
    const [ноль, семьдесят] = отрисовать([
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ, overlay: 0 },
      { ...ПОЛНАЯ, ...КАК_У_ВЕРСТАЛЬЩИКОВ, overlay: 70 },
    ]);
    expect(семьдесят).toContain("opacity:0.7");
    expect(ноль).not.toContain("opacity:0.7");
    expect(семьдесят).not.toEqual(ноль);
  });
});
