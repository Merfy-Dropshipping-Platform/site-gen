import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * vanilla — размеры и ширина «как у верстальщиков» по цели
 * (scripts/qa/designer-goal.ts vanilla, зеркало scripts/qa/designer-mirror/vanilla.ts),
 * Vanilla-theme @c65d9e1c.
 *
 * Владелец 24.09: «нужно как у верстальщиков, но при этом не ломать структуру
 * секций, их настроек, цветовых схем». С 25.09 у секций одна версия (владелец:
 * «стили приравнивали, секции и параметры менять не нужно было») — прежняя
 * ветка удалена вместе с признаком режима. Поэтому здесь три вида проверок:
 *   - классы верстальщиков;
 *   - выбранная мерчантом настройка (размер, ширина) работает как прежде;
 *   - признак режима (true/false) ничего не меняет, капс не растёт (число
 *     `uppercase` в разметке случая закреплено: `капс`).
 *
 * Что сделано (по полосам главной верстальщиков):
 *   Header — один ряд h-20 (меню, логотип, значки прибиты к первому ряду),
 *     значки 44×44 с рисунком 20px;
 *   Slideshow — подзаголовок вплотную к заголовку, полоса номеров «1 2 3» gap-4,
 *     область нажатия 44×44 (стрелки убраны 24.09 по просьбе тестера);
 *   MainText — абзац 14/1.5 в колонке 680 (размер текста «Средний» — значение
 *     по умолчанию, и не заданный, и выбранный), кнопка h-10 px-3 14, до кнопки
 *     40, полоса lg:py-20;
 *   ImageWithText — абзац mt-3;
 *
 * Владелец 25.09 «что в панели — то и на витрине»: у «Основного текста» в
 * defaultProps скрытые headingSize/textSize = 'medium', их вписывает первая же
 * правка — значит, «не задано» обязано рисовать «Средний». Заголовок
 * верстальщиков 16px «Средний» взять не может (меньше «Маленького» 17) — не
 * заданный заголовок теперь 20px; абзац верстальщиков порядок не ломает — его
 * рисует «Средний». У «Изображения с текстом» раскладка верстальщиков (текст
 * 352 и фото 652 по краям) уже «Маленькой» по колонке текста — не заданная
 * «Ширина» рисует «Большую» панели.
 *   Newsletter — подзаголовок в одну строку с lg, колонка до 1320;
 *   PopularProducts — кнопка «В корзину» h-11 px-3 и 24px от цены.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };

type Случай = {
  имя: string;
  block: string;
  props: Record<string, unknown>;
  есть: string[];
  нет: string[];
  /** Сколько раз в разметке стоит `uppercase` — больше не должно стать. */
  капс: number;
};

const СЛАЙДЫ = [1, 2, 3].map((n) => ({
  image: `https://vanilla.merfy.ru/images/vanilla-hero-slide-${n}.webp`,
  heading: { text: `Слайд ${n}` },
  text: { content: `Текст ${n}` },
  button: { text: "Кнопка", link: "/catalog" },
}));

const СЛУЧАИ: Случай[] = [
  {
    имя: "Header «по центру»: один ряд, значки 44×44",
    block: "Header",
    props: { id: "Header-1", colorScheme: "scheme-1" },
    есть: [
      "row-start-1",
      "flex min-h-11 min-w-11 items-center justify-center transition-opacity hover:opacity-80",
      "relative flex min-h-11 min-w-11 items-center justify-center transition-opacity hover:opacity-80",
    ],
    нет: ["flex size-8 items-center justify-center transition-opacity hover:opacity-80"],
    капс: 1,
  },
  {
    имя: "Header «сверху по центру»: два ряда остаются",
    block: "Header",
    props: { id: "Header-2", colorScheme: "scheme-1", logoPosition: "top-center" },
    есть: ["mt-3 flex w-full items-center justify-center gap-[40px]"],
    нет: ["row-start-1"],
    капс: 1,
  },
  {
    имя: "Slideshow: подзаголовок вплотную, полоса переключения",
    block: "Slideshow",
    props: { id: "Slideshow-1", slides: СЛАЙДЫ },
    есть: [
      " -mt-4",
      "flex h-16 items-center justify-center gap-4 ",
      "flex min-h-11 min-w-11 items-center justify-center p-1 font-normal uppercase",
      "flex items-center gap-4",
    ],
    // Стрелок «← →» в полосе больше нет: тестер 24.09 «убери на всех темах
    // стрелки справа и слева». Номера слайдов остаются.
    нет: ["gap-10 md:gap-12", "md:gap-14", "flex min-h-11 min-w-11 items-center justify-center text-white hover:opacity-90"],
    капс: 3,
  },
  {
    имя: "MainText без размеров: заголовок «Средний» 20, абзац и полоса верстальщиков",
    block: "MainText",
    props: {
      id: "MainText-1",
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
      button: { text: "Кнопка", link: "/catalog" },
    },
    есть: [
      "m-0 font-vanilla-bitter text-[20px]",
      "m-0 w-full max-w-[680px] font-vanilla-arsenal text-[14px] font-normal leading-[1.5]",
      "min-[1920px]:max-w-[1320px] min-[1920px]:text-[16px]",
      "inline-flex h-10 min-h-10 shrink-0",
      " px-3 font-vanilla-arsenal text-[14px]",
      "py-16 text-[rgb(var(--color-text,255_255_255))] lg:py-20",
      "flex-col items-center text-center gap-10",
    ],
    нет: ["m-0 font-vanilla-bitter text-[16px]", "lg:py-[120px]", "text-center gap-16"],
    капс: 0,
  },
  {
    имя: "MainText «Средний» выбран явно: то же, что не задан",
    block: "MainText",
    props: {
      id: "MainText-2",
      heading: { text: "Заголовок", size: "medium" },
      text: { content: "Текст", size: "medium" },
    },
    есть: ["m-0 font-vanilla-bitter text-[20px]", "m-0 w-full max-w-[680px] font-vanilla-arsenal text-[14px] font-normal leading-[1.5]"],
    нет: ["m-0 font-vanilla-bitter text-[16px]", "m-0 w-full font-vanilla-arsenal text-base font-normal leading-[1.45]"],
    капс: 0,
  },
  {
    имя: "MainText с выбранным НЕ по умолчанию размером: кегль мерчанта",
    block: "MainText",
    props: {
      id: "MainText-3",
      heading: { text: "Заголовок", size: "large" },
      text: { content: "Текст", size: "small" },
    },
    есть: ["m-0 font-vanilla-bitter text-[24px]", "m-0 w-full font-vanilla-arsenal text-[14px] font-normal leading-[1.45]"],
    нет: ["m-0 font-vanilla-bitter text-[16px]", "max-w-[680px]"],
    капс: 0,
  },
  {
    имя: "ImageWithText без «Ширины»: раскладка «Большой» панели, абзац mt-3",
    block: "ImageWithText",
    props: {
      id: "ImageWithText-1",
      image: { url: "https://vanilla.merfy.ru/images/vanilla-chair.webp", alt: "" },
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
    },
    есть: [
      "mt-3 flex w-full flex-col gap-4",
      "lg:flex-row lg:justify-center lg:gap-10",
      "lg:min-w-0 lg:shrink lg:grow-0",
    ],
    нет: ["lg:justify-between", "lg:w-[352px]", "lg:w-[652px]", "mt-5 flex w-full flex-col gap-4"],
    капс: 0,
  },
  {
    имя: "ImageWithText с «Шириной»: раскладка мерчанта",
    block: "ImageWithText",
    props: {
      id: "ImageWithText-2",
      image: { url: "https://vanilla.merfy.ru/images/vanilla-chair.webp", alt: "" },
      width: "small",
    },
    есть: ["lg:flex-row lg:justify-center", "lg:min-w-0 lg:max-w-none lg:shrink lg:grow-0"],
    нет: ["lg:w-[652px]", "lg:justify-between"],
    капс: 0,
  },
  {
    имя: "Newsletter: подзаголовок в одну строку с lg",
    block: "Newsletter",
    props: { id: "Newsletter-1", heading: { text: "Заголовок" }, text: { content: "Текст" } },
    есть: [" max-w-[1320px] lg:whitespace-nowrap"],
    нет: [],
    капс: 0,
  },
  {
    имя: "PopularProducts: кнопка «В корзину» как у верстальщиков",
    block: "PopularProducts",
    props: { id: "Popular-1", heading: { text: "Заголовок" }, quickAddMode: "standard" },
    есть: ["mt-6 inline-flex h-11 min-h-11 w-full items-center justify-center", " px-3 font-vanilla-arsenal text-base"],
    нет: ["mt-3 inline-flex h-12 min-h-12 w-full"],
    капс: 2,
  },
];

function отрисовать(props: (с: Случай) => Record<string, unknown>): string[] {
  return renderSections(
    "vanilla",
    СЛУЧАИ.map((с) => ({ block: с.block, props: props(с), catalog: КАТАЛОГ })),
  ).map((r, i) => {
    if (r.error) throw new Error(`${СЛУЧАИ[i].block}: ${r.error}`);
    return r.html ?? "";
  });
}

describe("vanilla: размеры и ширина как у верстальщиков (цель)", () => {
  const html = отрисовать((с) => с.props);
  const вкл = отрисовать((с) => ({ ...с.props, __designParity: true }));
  const выкл = отрисовать((с) => ({ ...с.props, __designParity: false }));

  СЛУЧАИ.forEach((с, i) => {
    it(`${с.имя}: как у верстальщиков`, () => {
      expect(html[i].length).toBeGreaterThan(0);
      for (const к of с.есть) expect(html[i]).toContain(к);
      for (const к of с.нет) expect(html[i]).not.toContain(к);
    });

    it(`${с.имя}: одна версия — признак режима (true, false) ничего не меняет`, () => {
      expect(вкл[i]).toEqual(html[i]);
      expect(выкл[i]).toEqual(html[i]);
    });

    it(`${с.имя}: капс не растёт`, () => {
      const считать = (h: string) => (h.match(/\buppercase\b/g) ?? []).length;
      expect(считать(html[i])).toBe(с.капс);
    });
  });
});
