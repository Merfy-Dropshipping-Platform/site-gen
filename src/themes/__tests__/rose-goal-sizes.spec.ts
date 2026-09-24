import { renderSections } from "../../../scripts/qa/lib/render";
import { classSelector, themeCss } from "../../../scripts/qa/lib/tailwind-css";
import * as PARITY from "../../../themes/rose/src/lib/design-parity";

/**
 * rose — размеры «как у верстальщиков» по цели designer-goal (24.09).
 *
 * Сторожит правки шага 2 брифа (кегли, зазоры, пропорции — под признаком
 * PARITY_DESIGN и только в ветке «по умолчанию» настройки):
 *   - с признаком и НЕсданной настройкой — классы верстальщиков
 *     (lib/design-parity.ts);
 *   - с признаком и ВЫСТАВЛЕННОЙ настройкой — прежний рендер этой настройки;
 *   - без признака — разметка байт в байт как при __designParity:false и без
 *     единого класса верстальщиков;
 *   - капс не растёт;
 *   - каждый класс верстальщиков есть в собранном CSS темы (иначе правка
 *     молча не действует на витрине).
 */

jest.setTimeout(90_000);

const ВКЛ = { __designParity: true };
const ВЫКЛ = { __designParity: false };

type Job = { block: string; props: Record<string, unknown> };

function отрисовать(jobs: Job[]): string[] {
  return renderSections(
    "rose",
    jobs.map((j) => ({ block: j.block, props: j.props })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

/** Astro экранирует `&` в атрибуте как `&#38;` — сравниваем по исходной строке. */
const разэкран = (html: string) => html.replace(/&#38;/g, "&").replace(/&amp;/g, "&");

const капсов = (html: string) => (html.match(/class="[^"]*\buppercase\b/g) ?? []).length;

/**
 * Секция: пропсы без признака, с признаком и с выставленной настройкой.
 * `designers` — строка класса, которая обязана появиться ТОЛЬКО с признаком
 * и несданной настройкой.
 */
const СЛУЧАИ: Array<{
  name: string;
  block: string;
  props: Record<string, unknown>;
  set: Record<string, unknown>;
  designers: string;
}> = [
  {
    name: "«Список коллекций»: заголовок 14/16 на телефоне/планшете",
    block: "Collections",
    props: { id: "Collections-1", heading: "Коллекции", subtitle: "Текст" },
    set: { headingSize: "large" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.heading,
  },
  {
    name: "«Список коллекций»: подзаголовок 12/14",
    block: "Collections",
    props: { id: "Collections-1", heading: "Коллекции", subtitle: "Текст" },
    set: { subtitleSize: "medium" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.text,
  },
  {
    name: "«Популярное»: заголовок 14/16",
    block: "PopularProducts",
    props: { id: "Popular-1", heading: "Хиты", text: "Текст" },
    set: { headingSize: "large" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.heading,
  },
  {
    name: "«Популярное»: портрет верстальщиков при несданном «Виде изображения»",
    block: "PopularProducts",
    props: { id: "Popular-1", heading: "Хиты" },
    set: { imageView: "square" },
    designers: PARITY.ROSE_POPULAR_DESIGNERS.aspectVar,
  },
  {
    name: "«Галерея»: заголовок clamp на телефоне, 16 на планшете",
    block: "Gallery",
    props: { id: "Gallery-1", heading: "Галерея", text: "Текст" },
    set: { headingSize: "small" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.galleryHeading,
  },
  {
    name: "Первый экран: заголовок 24 на планшете",
    block: "Hero",
    props: { id: "Hero-1", heading: { text: "Rose" }, text: { content: "Текст" }, backgroundImages: { url1: "/h.webp" } },
    set: { heading: { text: "Rose", size: "large" } },
    designers: PARITY.ROSE_HERO_DESIGNERS.heading,
  },
  {
    name: "Первый экран: кнопка 40px/14 на планшете",
    block: "Hero",
    props: { id: "Hero-1", heading: { text: "Rose" }, backgroundImages: { url1: "/h.webp" } },
    set: { size: "large" },
    designers: PARITY.ROSE_HERO_DESIGNERS.cta,
  },
  {
    name: "Первый экран: нижний отступ контента 80 на телефоне",
    block: "Hero",
    props: { id: "Hero-1", heading: { text: "Rose" }, backgroundImages: { url1: "/h.webp" } },
    set: { position: "bottom-center" },
    designers: PARITY.ROSE_HERO_DESIGNERS.contentPad,
  },
  {
    name: "Промо-полоса: кегль clamp(10px, 2vw + 5px, 16px)",
    block: "PromoBanner",
    props: { id: "PromoBanner-1", text: "Скидка 10%" },
    set: { size: "large" },
    designers: PARITY.ROSE_PROMO_TEXT_DESIGNERS,
  },
  {
    name: "Подвал: заголовок рассылки clamp(14px, 2.2vw, 20px)",
    block: "Footer",
    props: { id: "Footer-1", heading: { text: "Рассылка" }, text: { content: "Текст" } },
    set: { heading: { text: "Рассылка", size: "medium" } },
    designers: PARITY.ROSE_FOOTER_DESIGNERS.headingStyle,
  },
];

describe.each(СЛУЧАИ)("rose-goal: $name", ({ block, props, set, designers }) => {
  const [вкл, выкл, безПризнака, вклЗадано] = отрисовать([
    { block, props: { ...props, ...ВКЛ } },
    { block, props: { ...props, ...ВЫКЛ } },
    { block, props },
    { block, props: { ...props, ...set, ...ВКЛ } },
  ]).map(разэкран);

  it("с признаком и несданной настройкой — размер верстальщиков", () => {
    expect(вкл).toContain(designers);
  });

  it("выставленная мерчантом настройка работает как прежде", () => {
    expect(вклЗадано).not.toContain(designers);
  });

  it("без признака — прежняя разметка байт в байт, классов верстальщиков нет", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).not.toContain(designers);
  });

  it("капс не растёт", () => {
    expect(капсов(вкл)).toBeLessThanOrEqual(капсов(выкл));
  });
});

describe("rose-goal: «Популярное» — пропорция карточки и выбранный «Вид изображения»", () => {
  const БАЗА = { id: "Popular-1", heading: "Хиты" };
  const [вкл, квадрат, выкл] = отрисовать([
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ, imageView: "square" } },
    { block: "PopularProducts", props: БАЗА },
  ]).map(разэкран);

  it("несданный вид под признаком — карточки читают переменную сетки", () => {
    expect(вкл).toContain("aspect-ratio:var(--rose-card-ar)");
    expect(вкл).toContain('data-card-aspect="var(--rose-card-ar)"');
  });

  it("«Квадрат» мерчанта и рендер без признака — 1/1, как было", () => {
    expect(квадрат).toContain("aspect-ratio:1/1");
    expect(квадрат).not.toContain("--rose-card-ar");
    expect(выкл).toContain("aspect-ratio:1/1");
    expect(выкл).not.toContain("--rose-card-ar");
  });
});

describe("rose-goal: шапка — строка планшета 56px и кнопки-иконки 40px", () => {
  const [вкл, выкл, безПризнака] = отрисовать([
    { block: "Header", props: { id: "Header-1", ...ВКЛ } },
    { block: "Header", props: { id: "Header-1", ...ВЫКЛ } },
    { block: "Header", props: { id: "Header-1" } },
  ]);

  it("с признаком: md:h-14 у мобильной строки, size-10 у кнопок, p-2 pr-1 у коробки поиска", () => {
    expect(вкл).toContain(`lg:hidden ${PARITY.ROSE_HEADER_MOBILE_ROW_DESIGNERS}`);
    expect(вкл).toContain(`flex ${PARITY.ROSE_HEADER_ACTION_BTN_DESIGNERS} items-center`);
    expect(вкл).not.toContain("flex size-8 items-center");
    expect(вкл).toContain(PARITY.ROSE_HEADER_SEARCH_BOX_DESIGNERS);
  });

  it("без признака — прежние size-8 и p-2, байт в байт", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).toContain("flex size-8 items-center");
    expect(выкл).not.toContain("md:h-14");
    expect(выкл).not.toContain("p-2 pr-1");
  });
});

describe("rose-goal: классы верстальщиков есть в собранном CSS темы", () => {
  // Классы с произвольным вариантом ([&_h2]:…) Tailwind печатает вложенным
  // правилом (`& h2 {…}`) — ищем сам селектор класса в тексте бандла.
  const css = themeCss("rose");
  const строки = [
    ...Object.values(PARITY.ROSE_SECTION_HEADING_DESIGNERS),
    PARITY.ROSE_POPULAR_DESIGNERS.aspectVar,
    PARITY.ROSE_POPULAR_DESIGNERS.card,
    PARITY.ROSE_COLLECTIONS_CARD_DESIGNERS,
    PARITY.ROSE_GALLERY_TILES_DESIGNERS,
    PARITY.ROSE_HERO_DESIGNERS.cta,
    PARITY.ROSE_HERO_DESIGNERS.copyGap,
    PARITY.ROSE_HERO_DESIGNERS.contentPad,
    "md:!text-[24px]",
    "md:!font-medium",
    "md:font-medium",
    PARITY.ROSE_PROMO_TEXT_DESIGNERS,
    PARITY.ROSE_FOOTER_DESIGNERS.text,
    PARITY.ROSE_FOOTER_DESIGNERS.link,
    PARITY.ROSE_FOOTER_DESIGNERS.newsletter,
    PARITY.ROSE_HEADER_MOBILE_ROW_DESIGNERS,
    PARITY.ROSE_HEADER_ACTION_BTN_DESIGNERS,
    PARITY.ROSE_HEADER_SEARCH_BOX_DESIGNERS,
  ];
  const классы = [...new Set(строки.flatMap((s) => s.split(/\s+/).filter(Boolean)))];

  it.each(классы)("%s", (cls) => {
    expect(css.includes(`${classSelector(cls)} {`)).toBe(true);
  });
});
