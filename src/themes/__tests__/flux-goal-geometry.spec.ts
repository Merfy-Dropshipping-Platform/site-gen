import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * flux — цель «как у верстальщиков» (scripts/qa/designer-goal.ts flux),
 * вторая волна после flux-like-designers.spec.ts: размеры ВНУТРИ секций
 * главной по flux-theme@be32556d.
 *
 *   Collections — на телефоне плитка во всю ширину (grid-cols-1 sm:grid-cols-3);
 *   Popular     — карточка: зазор текст↔кнопка gap-6, кнопка h-12 px-4
 *                 md:16; заголовок по центру; «Смотреть ещё» 16;
 *   MainText    — абзац до 1320px, 16px по умолчанию, группы gap-2 / gap-10;
 *   Product     — контейнер 1480 (.flux-container-designers);
 *   Gallery     — плитка товара карточкой p-3, подпись/цена 14/16, вторая
 *                 плитка тянется до lg;
 *   Footer      — поле рассылки 429px h-14, кнопки соцсетей 44px, полоса 64px.
 *
 * С 25.09 у секций одна версия (владелец: «стили приравнивали, секции и
 * параметры менять не нужно было») — прежняя ветка удалена. Капс не растёт: число
 * `uppercase` у каждого случая закреплено (`капс`).
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };

type Секция = { block: string; props: Record<string, unknown> };

function отрисовать(jobs: Секция[]): string[] {
  return renderSections(
    "flux",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

/** Классы первого тега с данным data-атрибутом/маркером. */
function классы(html: string, маркер: RegExp): string[] {
  const тег = [...html.matchAll(/<[a-z0-9]+\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((t) => маркер.test(t));
  expect(тег).toBeDefined();
  return (тег!.match(/class="([^"]*)"/)?.[1] ?? "").trim().split(/\s+/);
}

type Случай = {
  секция: Секция;
  /** Классы верстальщиков — обязаны быть. */
  верстальщики: string[];
  /** Классы удалённой прежней ветки — их нет. */
  прежние: string[];
  /** Сколько раз в разметке стоит `uppercase` — больше не должно стать. */
  капс: number;
};

const СЛУЧАИ: Случай[] = [
  {
    секция: {
      block: "Collections",
      props: {
        id: "Collections-1",
        colorScheme: "scheme-1",
        collections: [{ heading: "А" }, { heading: "Б" }, { heading: "В" }],
      },
    },
    верстальщики: ["grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4"],
    прежние: ["grid grid-cols-2 gap-4 md:grid-cols-4"],
    капс: 0,
  },
  {
    секция: {
      block: "PopularProducts",
      props: { id: "PopularProducts-1", colorScheme: "scheme-1" },
    },
    верстальщики: [
      "[&#38;_[data-add-to-cart]]:h-12",
      "[&#38;_[data-nt=flux-product-card]>div:last-child]:gap-6",
      "md:[&#38;_[data-add-to-cart]]:text-[16px]",
      'class="flex flex-col gap-2 text-center"',
    ],
    прежние: ['class="flex flex-col gap-2"'],
    капс: 1,
  },
  {
    секция: {
      block: "MainText",
      props: {
        id: "MainText-1",
        colorScheme: "scheme-1",
        heading: { text: "Заголовок" },
        text: { content: "Текст" },
      },
    },
    верстальщики: [
      "flex w-full max-w-[1320px] flex-col gap-10",
      'class="flex flex-col gap-2"',
      "max-w-[1320px] font-roboto-flex font-light leading-normal",
    ],
    прежние: [
      "flex w-full max-w-[780px] flex-col gap-6 md:gap-8",
      "flex w-full flex-col gap-2 md:gap-4",
      "text-[16px] md:text-[19px]",
    ],
    капс: 0,
  },
  {
    секция: { block: "Product", props: { id: "Product-1", colorScheme: "scheme-1" } },
    верстальщики: ['class="flux-container-designers py-10 md:py-16"'],
    прежние: ['class="flux-container py-10 md:py-16"'],
    капс: 0,
  },
  {
    секция: {
      block: "Gallery",
      props: {
        id: "Gallery-1",
        colorScheme: "scheme-1",
        items: [
          { type: "image", url: "/a.png" },
          { type: "product", productId: "p1" },
          { type: "collection", collectionId: "col-1" },
        ],
      },
    },
    верстальщики: [
      "group flex h-full min-w-0 flex-col gap-4 rounded-[12px] p-3",
      "min-h-0 flex-1 lg:flex-none lg:aspect-[429/269]",
      "gallery-product-title font-roboto-flex text-[14px]",
    ],
    прежние: ["gallery-product-title font-roboto-flex text-[18px]"],
    капс: 0,
  },
  {
    секция: {
      block: "Footer",
      props: {
        id: "Footer-1",
        colorScheme: "scheme-3",
        socialColumn: { socialLinks: [{ platform: "vk", href: "https://vk.com/" }] },
      },
    },
    верстальщики: [
      "flex h-14 w-full max-w-[429px]",
      "flex size-11 items-center justify-center transition-opacity hover:opacity-70",
      "flex h-[64px] w-full",
      "flex size-11 shrink-0",
    ],
    прежние: ["max-w-[652px]", "md:h-[100px]", "flex size-8 shrink-0", "flex items-center gap-4"],
    капс: 2,
  },
];

describe("flux: размеры внутри секций главной как у верстальщиков", () => {
  const html = отрисовать(СЛУЧАИ.map((с) => с.секция));

  СЛУЧАИ.forEach((с, i) => {
    it(`${с.секция.block}: классы верстальщиков, прежних нет`, () => {
      for (const к of с.верстальщики) expect(html[i]).toContain(к);
      for (const к of с.прежние) expect(html[i]).not.toContain(к);
    });

    it(`${с.секция.block}: капс верстальщиков не добавлен`, () => {
      const капс = (h: string) => (h.match(/\buppercase\b/g) ?? []).length;
      expect(капс(html[i])).toBe(с.капс);
    });
  });
});

describe("flux: настройки, задающие размер, работают как прежде", () => {
  it("MainText «Размер текста» small/large — кегль мерчанта", () => {
    const база = { id: "MainText-1", heading: { text: "З" } };
    const [sm, lg] = отрисовать([
      { block: "MainText", props: { ...база, text: { content: "Т", size: "small" } } },
      { block: "MainText", props: { ...база, text: { content: "Т", size: "large" } } },
    ]);
    const абзац = (h: string) => классы(h, /data-puck-subsection-field="text"/);
    expect(абзац(sm)).toContain("text-[14px]");
    expect(абзац(sm)).toContain("md:text-[16px]");
    expect(абзац(lg)).toContain("md:text-[23px]");
  });

  it("Collections «Колонки» по-прежнему уходят в --cols", () => {
    const [h] = отрисовать([{ block: "Collections", props: { id: "Collections-1", columns: 5 } }]);
    expect(h).toContain('style="--cols:5"');
  });

  it("Footer: свои отступы мерчанта сохраняют инлайн-стиль", () => {
    const [h] = отрисовать([
      { block: "Footer", props: { id: "Footer-1", padding: { top: 20, bottom: 20 } } },
    ]);
    expect(h).toContain('style="padding-top:20px;padding-bottom:20px;"');
  });
});
