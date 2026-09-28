import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * Секции bloom — отступы, зазоры и высота строк как в актуальной вёрстке
 * верстальщиков (Bloom-theme @5aae2ad6).
 *
 * Владелец 23.09 после первого экрана: «лучше стало, нужно пройтись по всем
 * секциям» — и раньше: «только стили, не сломай цветовые схемы и настройки».
 * Верстальщики после нашего снимка 07.06 поменяли в этих секциях только
 * геометрию; её и переносим:
 *   «Основной текст» (Philosophy): текст 20 → md 24, leading-normal, md:gap-16,
 *     кнопка px-4 (размер «Большой»/по умолчанию; «Средний» и «Маленький» —
 *     наши, у верстальщиков их нет);
 *   «Мультиколонны» (Benefits): сетка gap-4, карточка min-h только с md,
 *     8 между медиа и текстом (gap-3 + mb-5), leading-normal;
 *   «Галерея»: правая колонка gap-4;
 *   «Подвал»: pb-20, gap-16, поле pl-3, кнопка px-2, строки gap-1, контакты
 *     mt-6, списки gap-2, правовая строка gap-8.
 * Капс верстальщиков НЕ переносим: 13.09 владелец велел его убрать.
 * С 25.09 у секций одна версия — прежняя ветка удалена.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };

type Секция = { block: string; props: Record<string, unknown> };
const СЕКЦИИ: Секция[] = [
  {
    block: "MainText",
    props: {
      id: "MainText-1",
      colorScheme: "scheme-1",
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
      button: { text: "Подробнее", link: "/about" },
    },
  },
  {
    block: "MultiColumns",
    props: {
      id: "MultiColumns-1",
      colorScheme: "scheme-1",
      columns: [
        { heading: "Первая", text: "Текст", image: "/images/placeholder.png" },
        { heading: "Вторая", text: "Текст" },
        { heading: "Третья", text: "Текст" },
      ],
    },
  },
  {
    block: "Gallery",
    props: {
      id: "Gallery-1",
      colorScheme: "scheme-1",
      items: [
        { type: "image", image: "/images/placeholder.png" },
        { type: "image", image: "/images/placeholder.png" },
        { type: "product" },
      ],
    },
  },
  {
    block: "Footer",
    props: {
      id: "Footer-1",
      colorScheme: "scheme-3",
      phone: "+7 900 000-00-00",
      // Правовая строка рисуется, только если мерчант завёл копирайт сам.
      copyright: "© Магазин",
      socialColumn: {
        email: "shop@example.com",
        contactFields: [{ label: "Адрес", value: "Москва, Тверская 1" }],
      },
    },
  },
];

function отрисовать(jobs: Секция[]): string[] {
  return renderSections(
    "bloom",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

const ОЖИДАНИЯ: Record<string, { есть: string[]; нет: string[] }> = {
  MainText: {
    есть: [
      "text-[20px]",
      "leading-normal",
      "md:text-[24px]",
      "md:gap-16",
      "px-4",
    ],
    нет: [],
  },
  MultiColumns: {
    есть: [
      "justify-items-center gap-4",
      "md:min-h-[252px]",
      "gap-3",
      "mb-5",
      "leading-normal",
    ],
    // gap-10 остаётся у обёртки «заголовок ↔ сетка»: у Benefits заголовка нет.
    нет: [" min-h-[252px]", "justify-items-center gap-10"],
  },
  Gallery: { есть: ["gap-4"], нет: ["gap-5"] },
  Footer: {
    есть: [
      "pt-16 pb-20",
      "gap-16",
      "pl-3",
      "px-2",
      "gap-1",
      "mt-6",
      "gap-2",
      "gap-8",
    ],
    нет: ["pb-24", "md:pb-28", "gap-[3px]"],
  },
};

describe("bloom: секции как у верстальщиков", () => {
  const отрисовано = отрисовать(СЕКЦИИ);

  СЕКЦИИ.forEach((с, i) => {
    it(`${с.block}: классы верстальщиков`, () => {
      expect(отрисовано[i].length).toBeGreaterThan(0);
      for (const к of ОЖИДАНИЯ[с.block].есть) expect(отрисовано[i]).toContain(к);
      for (const к of ОЖИДАНИЯ[с.block].нет) expect(отрисовано[i]).not.toContain(к);
    });
  });

  it("капс верстальщиков не перенесён", () => {
    for (const html of отрисовано)
      expect(html).not.toMatch(/class="[^"]*\buppercase\b/);
  });
});
