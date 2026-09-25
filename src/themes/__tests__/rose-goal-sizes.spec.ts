import { renderSections } from "../../../scripts/qa/lib/render";
import { classSelector, themeCss } from "../../../scripts/qa/lib/tailwind-css";
import * as PARITY from "../../../themes/rose/src/lib/design-parity";

/**
 * rose — размеры «как у верстальщиков» по цели designer-goal (24.09),
 * пересобранные по решению владельца 25.09 «что в панели — то и на витрине».
 *
 * Два вида полей с кеглями верстальщиков под признаком PARITY_DESIGN:
 *   - «значение по умолчанию берёт числа верстальщиков» (порядок
 *     «Маленький ≤ Средний ≤ Большой» сохраняется — panel-size-order.spec.ts):
 *     с признаком их рисует и не заданное поле, и ЯВНО выбранное значение по
 *     умолчанию; остальные варианты — прежние;
 *   - «ветка не задано» — только у полей, которые панель не заполняет
 *     значением по умолчанию (Hero: размер заголовка, «Позиция»; размер в
 *     объекте подвала): с признаком и не заданным полем — классы
 *     верстальщиков, выбранное мерчантом значение — прежнее.
 * Поля, чьи числа верстальщиков порядок ломали («Список коллекций» и
 * «Галерея» — заголовок, «Галерея» — текст, Hero «Размер» (кнопка), промо-полоса,
 * «Вид изображения» «Популярного»), чисел верстальщиков больше не имеют: их
 * «не задано» сверяет со значением панели panel-default-is-noop.spec.ts в
 * обоих режимах.
 * Везде: без признака — разметка байт в байт как при __designParity:false и
 * без единого класса верстальщиков; капс не растёт; каждый класс
 * верстальщиков есть в собранном CSS темы (иначе правка молча не действует на
 * витрине).
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
 * Секция: пропсы без поля, выставленное НЕ по умолчанию значение (`set`) и,
 * у полей первого вида, явно выбранное значение по умолчанию (`def`).
 * `designers` — строка класса верстальщиков этого поля.
 */
const СЛУЧАИ: Array<{
  name: string;
  block: string;
  props: Record<string, unknown>;
  set: Record<string, unknown>;
  def?: Record<string, unknown>;
  designers: string;
}> = [
  {
    name: "«Список коллекций»: подзаголовок «Маленький» 12/14",
    block: "Collections",
    props: { id: "Collections-1", heading: "Коллекции", subtitle: "Текст" },
    set: { subtitleSize: "medium" },
    def: { subtitleSize: "small" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.text,
  },
  {
    name: "«Популярное»: заголовок «Маленький» 14/16",
    block: "PopularProducts",
    props: { id: "Popular-1", heading: "Хиты", text: "Текст" },
    set: { headingSize: "large" },
    def: { headingSize: "small" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.heading,
  },
  {
    name: "«Популярное»: текст «Маленький» 12/14",
    block: "PopularProducts",
    props: { id: "Popular-1", heading: "Хиты", text: "Текст" },
    set: { textSize: "medium" },
    def: { textSize: "small" },
    designers: PARITY.ROSE_SECTION_HEADING_DESIGNERS.text,
  },
  {
    name: "Первый экран: заголовок 24 на планшете (размер заголовка не задан)",
    block: "Hero",
    props: { id: "Hero-1", heading: { text: "Rose" }, text: { content: "Текст" }, backgroundImages: { url1: "/h.webp" } },
    set: { heading: { text: "Rose", size: "large" } },
    designers: PARITY.ROSE_HERO_DESIGNERS.heading,
  },
  {
    name: "Первый экран: нижний отступ контента 80 на телефоне («Позиция» не задана)",
    block: "Hero",
    props: { id: "Hero-1", heading: { text: "Rose" }, backgroundImages: { url1: "/h.webp" } },
    set: { position: "bottom-center" },
    designers: PARITY.ROSE_HERO_DESIGNERS.contentPad,
  },
  {
    name: "Подвал: заголовок рассылки clamp(14px, 2.2vw, 20px)",
    block: "Footer",
    props: { id: "Footer-1", heading: { text: "Рассылка" }, text: { content: "Текст" } },
    set: { heading: { text: "Рассылка", size: "medium" } },
    designers: PARITY.ROSE_FOOTER_DESIGNERS.headingStyle,
  },
];

describe.each(СЛУЧАИ)("rose-goal: $name", ({ block, props, set, def, designers }) => {
  const [вкл, выкл, безПризнака, вклЗадано, вклПоУмолчанию] = отрисовать([
    { block, props: { ...props, ...ВКЛ } },
    { block, props: { ...props, ...ВЫКЛ } },
    { block, props },
    { block, props: { ...props, ...set, ...ВКЛ } },
    { block, props: { ...props, ...(def ?? set), ...ВКЛ } },
  ]).map(разэкран);

  it("с признаком и несданной настройкой — размер верстальщиков", () => {
    expect(вкл).toContain(designers);
  });

  it("с признаком выбранное НЕ по умолчанию значение — прежний вариант", () => {
    expect(вклЗадано).not.toContain(designers);
  });

  it("с признаком явно выбранное значение по умолчанию — то же, что не заданное", () => {
    // Иначе панель, показывающая значение по умолчанию, и витрина расходятся:
    // первая правка секции вписывает его, и вид прыгает.
    if (def) expect(вклПоУмолчанию).toEqual(вкл);
    else expect(вклПоУмолчанию).not.toContain(designers);
  });

  it("без признака — прежняя разметка байт в байт, классов верстальщиков нет", () => {
    expect(выкл).toEqual(безПризнака);
    expect(выкл).not.toContain(designers);
  });

  it("капс не растёт", () => {
    expect(капсов(вкл)).toBeLessThanOrEqual(капсов(выкл));
  });
});

describe("rose-goal: «Популярное» — «Вид изображения» не задан = «Квадрат» и с признаком", () => {
  const БАЗА = { id: "Popular-1", heading: "Хиты" };
  const [вкл, квадрат, выкл] = отрисовать([
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ } },
    { block: "PopularProducts", props: { ...БАЗА, ...ВКЛ, imageView: "square" } },
    { block: "PopularProducts", props: БАЗА },
  ]).map(разэкран);

  it("несданный вид под признаком — квадрат 1/1, как «Квадрат» панели", () => {
    expect(вкл).toEqual(квадрат);
    expect(вкл).toContain("aspect-ratio:1/1");
    expect(вкл).not.toContain("--rose-card-ar");
  });

  it("без признака — тот же квадрат 1/1", () => {
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
    PARITY.ROSE_POPULAR_DESIGNERS.card,
    PARITY.ROSE_COLLECTIONS_CARD_DESIGNERS,
    PARITY.ROSE_GALLERY_TILES_DESIGNERS,
    PARITY.ROSE_HERO_DESIGNERS.copyGap,
    PARITY.ROSE_HERO_DESIGNERS.contentPad,
    "md:!text-[24px]",
    "md:!font-medium",
    "md:font-medium",
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
