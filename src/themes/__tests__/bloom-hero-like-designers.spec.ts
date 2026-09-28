import { renderSections } from "../../../scripts/qa/lib/render";

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
 *     контейнер, кнопки и цвета из схемы — без изменений.
 * С 25.09 у секции одна версия — прежняя ветка удалена.
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

describe("bloom, первый экран: как у верстальщиков", () => {
  it("фото вписано по высоте, а не заливает блок", () => {
    const [html] = отрисовать([ПОЛНАЯ]);
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
      { ...ПОЛНАЯ, backgroundImages: { url1: "https://minio.merfy.ru/media/own-photo.jpg" } },
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
      ПОЛНАЯ,
      { ...ПОЛНАЯ, size: "large" },
    ]);
    for (const html of [поУмолчанию, большой]) {
      const блок = классыБлока(html).split(/\s+/);
      for (const к of БОЛЬШОЙ) expect(блок).toContain(к);
    }
  });

  it("«Средний» и «Маленький» — та же пропорция, ниже в 0,8 и 0,6 раза", () => {
    const [средний, маленький] = отрисовать([
      { ...ПОЛНАЯ, size: "medium" },
      { ...ПОЛНАЯ, size: "small" },
    ]);
    const с = классыБлока(средний).split(/\s+/);
    const м = классыБлока(маленький).split(/\s+/);
    for (const к of СРЕДНИЙ) expect(с).toContain(к);
    for (const к of МАЛЕНЬКИЙ) expect(м).toContain(к);
  });

  it("остальные настройки по-прежнему меняют секцию", () => {
    const база = ПОЛНАЯ;
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

  it("два фото: половины заливают свои колонки", () => {
    const [два] = отрисовать([{ ...ПОЛНАЯ, backgroundImages: { url1: ФОТО, url2: ФОТО2 } }]);
    expect(классыФото(два, ФОТО)).toContain("object-cover");
    expect(классыФото(два, ФОТО2)).toContain("object-cover");
  });

  it("на мониторах шире 1920 текст в колонке 1320 по центру, как остальные секции", () => {
    const [html] = отрисовать([ПОЛНАЯ]);
    expect(html).toContain("2xl:px-[max(300px,calc(50%_-_660px))]");
    expect(html).not.toContain("2xl:px-[300px]");
  });

  it("высота — пропорция верстальщиков, прежней лестницы min-h нет", () => {
    const [html] = отрисовать([ПОЛНАЯ]);
    expect(классыБлока(html)).toContain("aspect-[375/716]");
    expect(классыБлока(html)).not.toContain("min-h-[min(80svh,620px)]");
  });
});

describe("bloom, первый экран: затемнение только из ползунка", () => {
  // Владелец 25.09: «в зависимости от настройки затемнения, если 0 — то и там и
  // там светло». Постоянной подложки (раньше: градиент на весь блок или только
  // на телефоне) больше нет — затемнение даёт только ползунок «Затемнение»,
  // одинаково на всех ширинах.
  it("постоянного градиента нет", () => {
    const [html] = отрисовать([ПОЛНАЯ]);
    expect(html).not.toContain("from-black/75 via-black/40");
    expect(html).not.toContain("from-black/45 to-black/10");
  });

  it("ползунок «Затемнение» по-прежнему работает", () => {
    // У bloom «Затемнение» по умолчанию уже задано темой — сравниваем два значения.
    const [ноль, семьдесят] = отрисовать([
      { ...ПОЛНАЯ, overlay: 0 },
      { ...ПОЛНАЯ, overlay: 70 },
    ]);
    expect(семьдесят).toContain("opacity:0.7");
    expect(ноль).not.toContain("opacity:0.7");
    expect(семьдесят).not.toEqual(ноль);
  });
});
