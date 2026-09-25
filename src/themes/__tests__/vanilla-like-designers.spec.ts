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
 * vanilla — шапка, подвал и секции как в актуальной вёрстке верстальщиков
 * (Vanilla-theme @c65d9e1c776cc5f2a80cd2525c1fcb18a38fad9e), под PARITY_DESIGN.
 *
 * Владелец 23-24.09: «делать как верстальщики, актуально, в точности»,
 * «не сломай цветовые схемы, ничего не сломай, нужно только стили, базовые».
 *
 * Разбор владельца (см. бриф .worktrees/DESIGN-BRIEF.md):
 *   Header/Footer — встроенный вордмарк «Vanila» (одна «l») отстал от
 *     верстальщиков: у них «Vanilla» (две «l») — ДРУГОЙ рисунок (7 путей
 *     вместо 6, diff путей это подтвердил), не только размер/viewBox. Ширина
 *     мобилы 76→85, десктопа 89→98 (Header.astro и Footer.astro:329).
 *   Collections/Popular — шапка секции: обёртка 760→1320px (их
 *     .vanilla-section-head), подзаголовок не переносится с lg (их
 *     .vanilla-section-subtitle) — геометрия обёртки, не шрифт.
 *   Gallery — отступ абзаца под заголовком mt-10→mt-3 (Gallery.astro:54-59).
 *   Footer — соцсети: область клика size-5→min-h-11/min-w-11, зазор
 *     gap-3→gap-1 (иконка та же).
 *   PromoBanner — «Большой» (дефолт темы) — адаптивная полоса
 *     min-h-12/text-16 везде → min-h-11/text-14 моб, md:min-h-12/md:text-16.
 *
 * Капс верстальщиков НЕ переносим (владелец 13.09 велел его убрать).
 * Без признака разметка байт в байт прежняя.
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ВКЛ = { __designParity: true };

type Секция = { block: string; props: Record<string, unknown> };

const СЕКЦИИ: Секция[] = [
  { block: "Header", props: { id: "Header-1", colorScheme: "scheme-1" } },
  {
    block: "Header",
    props: {
      id: "Header-2",
      colorScheme: "scheme-1",
      logoPosition: "top-left",
    },
  },
  {
    block: "Header",
    props: {
      id: "Header-3",
      colorScheme: "scheme-1",
      logoPosition: "top-center",
    },
  },
  {
    block: "Footer",
    props: {
      id: "Footer-1",
      colorScheme: "scheme-3",
      socialColumn: {
        email: "shop@example.com",
        socialLinks: [{ platform: "telegram", href: "https://t.me/shop" }],
      },
    },
  },
  {
    block: "Collections",
    props: {
      id: "Collections-1",
      colorScheme: "scheme-1",
      heading: { text: "Заголовок" },
      subtitle: "Подзаголовок",
    },
  },
  {
    block: "PopularProducts",
    props: {
      id: "Popular-1",
      colorScheme: "scheme-1",
      heading: { text: "Заголовок" },
      text: { content: "Подзаголовок" },
    },
  },
  {
    block: "Gallery",
    props: {
      id: "Gallery-1",
      colorScheme: "scheme-1",
      heading: { text: "Заголовок" },
      text: "Текст под заголовком",
    },
  },
  {
    block: "PromoBanner",
    props: { id: "PromoBanner-1", colorScheme: "scheme-1", text: "Объявление" },
  },
];

function отрисовать(jobs: Секция[]): string[] {
  return renderSections(
    "vanilla",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r, i) => {
    if (r.error) throw new Error(`${jobs[i].block}: ${r.error}`);
    return r.html ?? "";
  });
}

const ОЖИДАНИЯ: Record<string, { есть: string[]; нет: string[] }> = {
  Header: {
    есть: ["max-w-[85px]", "w-[98px]", "Vanila-designers.svg"],
    нет: ["max-w-[76px]", "max-w-[89px]"],
  },
  Footer: {
    есть: [
      "h-7 w-[98px]",
      "flex flex-wrap items-center justify-center gap-1 md:justify-end",
      "flex min-h-11 min-w-11 items-center justify-center transition-opacity hover:opacity-70",
      "Vanila-designers.svg",
    ],
    нет: [
      "h-7 w-[89px]",
      "flex flex-wrap items-center justify-center gap-3 md:justify-end",
      "flex size-5 items-center justify-center transition-opacity hover:opacity-70",
    ],
  },
  Collections: {
    есть: [
      "flex w-full max-w-[1320px] flex-col gap-2",
      "w-full max-w-[1320px] lg:whitespace-nowrap",
    ],
    нет: ["flex max-w-[760px] flex-col gap-2"],
  },
  PopularProducts: {
    есть: [
      "flex w-full max-w-[1320px] flex-col gap-2",
      "w-full max-w-[1320px] lg:whitespace-nowrap",
    ],
    нет: ["flex max-w-[760px] flex-col gap-2"],
  },
  Gallery: {
    есть: ["mt-3 w-full max-w-[680px]"],
    нет: ["mt-10 w-full max-w-[680px]"],
  },
  PromoBanner: {
    есть: [
      "flex min-h-11 md:min-h-12 w-full",
      "font-vanilla-arsenal text-[14px] md:text-[16px] font-normal",
    ],
    нет: ["flex min-h-12 w-full"],
  },
};

describe("vanilla: шапка, подвал и секции как у верстальщиков под PARITY_DESIGN", () => {
  const вкл = отрисовать(
    СЕКЦИИ.map((с) => ({ ...с, props: { ...с.props, ...ВКЛ } })),
  );
  const выкл = отрисовать(СЕКЦИИ);
  const безПризнака = отрисовать(
    СЕКЦИИ.map((с) => ({ ...с, props: { ...с.props, __designParity: false } })),
  );

  СЕКЦИИ.forEach((с, i) => {
    it(`${с.block} (${с.props.id}): с признаком — классы верстальщиков`, () => {
      expect(вкл[i].length).toBeGreaterThan(0);
      for (const к of ОЖИДАНИЯ[с.block].есть) expect(вкл[i]).toContain(к);
      for (const к of ОЖИДАНИЯ[с.block].нет) expect(вкл[i]).not.toContain(к);
    });

    it(`${с.block} (${с.props.id}): без признака разметка прежняя`, () => {
      expect(безПризнака[i]).toEqual(выкл[i]);
      expect(вкл[i]).not.toEqual(выкл[i]);
    });

    it(`${с.block} (${с.props.id}): капс верстальщиков не перенесён (число uppercase не растёт)`, () => {
      const считать = (html: string) =>
        (html.match(/\buppercase\b/g) ?? []).length;
      expect(считать(вкл[i])).toBe(считать(выкл[i]));
    });
  });

  it("Header/Footer: без признака рисуется прежний вордмарк (одна «l»), не -designers.svg", () => {
    for (const i of [0, 1, 2, 3]) {
      expect(выкл[i]).not.toContain("Vanila-designers.svg");
    }
  });
});
