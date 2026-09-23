import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * flux — геометрия секций как в актуальной вёрстке верстальщиков
 * (flux-theme@be32556d), под PARITY_DESIGN.
 *
 * Владелец 23-24.09: «делать как верстальщики, актуально, в точности»,
 * «не сломай цветовые схемы, ничего не сломай, нужно только стили, базовые».
 *
 * Три правки:
 *   1. Контейнер темы (.flux-container / инлайн-дубли во всех секциях
 *      главной, Header, Footer, FluxNavItem mega-menu): 1480 + поля
 *      1rem/2.5rem(md)/5rem(lg) вместо носителя темы 1920 + 1rem/5rem(md)/
 *      20rem(2xl) (flux-theme@be32556d src/styles/global.css:30).
 *   2. Первый экран (Hero, размер «Большой» = дефолт): первая ступень высоты
 *      на sm: вместо md: и калиброванный крой одного фото с базового
 *      брейкпоинта (не с md:), как flux-theme@be32556d Hero.astro:26,29,35.
 *   3. Подвал (Footer, ветка значения по умолчанию «Отступов»): py-12
 *      md:py-[80px], gap-10 md:gap-[80px] вместо py-12 md:py-16 / gap-10
 *      (flux-theme@be32556d Footer.astro:39); нестандартные отступы мерчанта
 *      — прежние.
 *
 * Без признака PARITY_DESIGN разметка байт в байт прежняя (признак ставит
 * sites, page-blocks `designParityFlag`, — секции его не запрашивают).
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ВКЛ = { __designParity: true };

/** Классы токена — точное вхождение (не подстрокой: "flux-container" ⊂ "flux-container-designers"). */
function токеныКласса(html: string, маркер: string): string[] {
  const re = new RegExp(
    `class="([^"]*${маркер.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]*)"`,
  );
  const m = html.match(re);
  expect(m).not.toBeNull();
  return (m![1] ?? "").split(/\s+/);
}

type Секция = { block: string; props: Record<string, unknown> };

const СЕКЦИИ: Секция[] = [
  {
    block: "Collections",
    props: { id: "Collections-1", colorScheme: "scheme-1" },
  },
  {
    block: "PopularProducts",
    props: { id: "PopularProducts-1", colorScheme: "scheme-1" },
  },
  {
    block: "MainText",
    props: {
      id: "MainText-1",
      colorScheme: "scheme-1",
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
    },
  },
  {
    block: "Gallery",
    props: {
      id: "Gallery-1",
      colorScheme: "scheme-1",
      items: [{ type: "image", image: "/images/placeholder.png" }],
    },
  },
  {
    block: "CollapsibleSection",
    props: { id: "CollapsibleSection-1", colorScheme: "scheme-1" },
  },
  {
    block: "ImageWithText",
    props: { id: "ImageWithText-1", colorScheme: "scheme-1" },
  },
  {
    block: "ContactForm",
    props: { id: "ContactForm-1", colorScheme: "scheme-1" },
  },
  {
    block: "MultiRows",
    props: { id: "MultiRows-1", colorScheme: "scheme-1" },
  },
  {
    block: "MultiColumns",
    props: {
      id: "MultiColumns-1",
      colorScheme: "scheme-1",
      columns: [{ heading: "Первая", text: "Текст" }],
    },
  },
  {
    block: "Video",
    props: {
      id: "Video-1",
      colorScheme: "scheme-1",
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
    },
  },
  {
    block: "Slideshow",
    props: {
      id: "Slideshow-1",
      colorScheme: "scheme-1",
      imagePosition: "contained",
    },
  },
  {
    block: "Newsletter",
    props: { id: "Newsletter-1", colorScheme: "scheme-1" },
  },
  {
    block: "CartSection",
    props: { id: "CartSection-1", colorScheme: "scheme-1" },
  },
  {
    block: "CartBody",
    props: { id: "CartBody-1", colorScheme: "scheme-1" },
  },
  {
    block: "CartSummary",
    props: { id: "CartSummary-1", colorScheme: "scheme-1" },
  },
];

function отрисовать(jobs: Секция[]): string[] {
  return renderSections(
    "flux",
    jobs.map((j) => ({ block: j.block, props: j.props, catalog: КАТАЛОГ })),
  ).map((r) => {
    if (r.error) throw new Error(`${r.block}: ${r.error}`);
    return r.html ?? "";
  });
}

describe("flux: контейнер секций главной как у верстальщиков под PARITY_DESIGN", () => {
  const вкл = отрисовать(
    СЕКЦИИ.map((с) => ({ ...с, props: { ...с.props, ...ВКЛ } })),
  );
  const выкл = отрисовать(СЕКЦИИ);
  const безПризнака = отрисовать(
    СЕКЦИИ.map((с) => ({ ...с, props: { ...с.props, __designParity: false } })),
  );

  СЕКЦИИ.forEach((с, i) => {
    it(`${с.block}: с признаком — контейнер 1480/px-4/md:px-10/lg:px-20`, () => {
      expect(вкл[i].length).toBeGreaterThan(0);
      expect(вкл[i]).toContain("max-w-[1480px]");
      expect(вкл[i]).toContain("md:px-10");
      expect(вкл[i]).toContain("lg:px-20");
      expect(вкл[i]).not.toContain("max-w-[1920px]");
      expect(вкл[i]).not.toContain("2xl:px-80");
    });

    it(`${с.block}: без признака — контейнер 1920/px-4/md:px-20/2xl:px-80, разметка прежняя`, () => {
      expect(выкл[i]).toContain("max-w-[1920px]");
      expect(выкл[i]).toContain("2xl:px-80");
      expect(выкл[i]).not.toContain("max-w-[1480px]");
      expect(безПризнака[i]).toEqual(выкл[i]);
      expect(вкл[i]).not.toEqual(выкл[i]);
    });
  });

  it("капс верстальщиков не добавлен (число uppercase-классов не растёт)", () => {
    const счётUppercase = (html: string) =>
      (html.match(/\buppercase\b/g) ?? []).length;
    СЕКЦИИ.forEach((_, i) => {
      expect(счётUppercase(вкл[i])).toBe(счётUppercase(выкл[i]));
    });
  });
});

describe("flux: MultiColumns — «Ширина» контента продолжает работать рядом с контейнером", () => {
  it("вложенная 'Ширина'=full отличается от дефолта под признаком", () => {
    const база = {
      id: "MultiColumns-1",
      colorScheme: "scheme-1",
      columns: [{ heading: "А", text: "Б" }],
      ...ВКЛ,
    };
    const [дефолт, full] = отрисовать([
      { block: "MultiColumns", props: база },
      { block: "MultiColumns", props: { ...база, width: "full" } },
    ]);
    expect(full).not.toEqual(дефолт);
  });
});

describe("flux: Footer — контейнер и подвал верстальщика под PARITY_DESIGN", () => {
  const дефолтныеОтступы = {
    id: "Footer-1",
    colorScheme: "scheme-3",
    phone: "+7 900 000-00-00",
    copyright: "© Магазин",
  };
  // footerPadStyle срабатывает при НЕ-canon {top,bottom} (canon = 64/64).
  const своиОтступы = { ...дефолтныеОтступы, padding: { top: 20, bottom: 20 } };

  it("ветка значения по умолчанию «Отступов»: py-12 md:py-[80px], gap-10 md:gap-[80px], контейнер 1480", () => {
    const [html] = отрисовать([
      { block: "Footer", props: { ...дефолтныеОтступы, ...ВКЛ } },
    ]);
    for (const к of [
      "max-w-[1480px]",
      "md:px-10",
      "lg:px-20",
      "gap-10",
      "md:gap-[80px]",
      "py-12",
      "md:py-[80px]",
    ]) {
      expect(html).toContain(к);
    }
    expect(html).not.toContain("max-w-[1920px]");
    expect(html).not.toContain("2xl:px-80");
    expect(html).not.toContain("md:py-16");
  });

  it("нестандартные отступы мерчанта: контейнер 1480, но gap/py — прежние (footerPadStyle рулит инлайн-стилем)", () => {
    const [html] = отрисовать([
      { block: "Footer", props: { ...своиОтступы, ...ВКЛ } },
    ]);
    expect(html).toContain("max-w-[1480px]");
    expect(html).toContain("gap-10");
    expect(html).not.toContain("md:gap-[80px]");
    expect(html).not.toContain("md:py-[80px]");
    expect(html).toContain('style="padding-top:20px;padding-bottom:20px;"');
  });

  it("без признака — обе ветки байт в байт прежние", () => {
    const [дефВкл, дефВыкл, дефБезПризнака] = отрисовать([
      { block: "Footer", props: дефолтныеОтступы },
      { block: "Footer", props: дефолтныеОтступы },
      {
        block: "Footer",
        props: { ...дефолтныеОтступы, __designParity: false },
      },
    ]);
    expect(дефВкл).toEqual(дефВыкл);
    expect(дефБезПризнака).toEqual(дефВыкл);
    const [своиВыкл, своиБезПризнака] = отрисовать([
      { block: "Footer", props: своиОтступы },
      { block: "Footer", props: { ...своиОтступы, __designParity: false } },
    ]);
    expect(своиБезПризнака).toEqual(своиВыкл);
  });
});

describe("flux: Header + FluxNavItem mega-menu — контейнер верстальщика под PARITY_DESIGN", () => {
  const базаHeader = {
    id: "Header-1",
    colorScheme: "scheme-1",
    logoPosition: "top-left",
    menuType: "mega-menu",
    navigationLinks: [
      {
        label: "Каталог",
        href: "/catalog",
        submenu: [{ label: "Тут", href: "/tut" }],
      },
    ],
  };

  it("десктопный контейнер шапки — 1480/px-4/md:px-10/lg:px-20 под признаком", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...базаHeader, ...ВКЛ } },
    ]);
    expect(html).toContain("max-w-[1480px]");
    expect(html).toContain("md:px-10");
    expect(html).toContain("lg:px-20");
  });

  it("mega-menu контейнер (FluxNavItem) — класс flux-container-designers под признаком", () => {
    const [html] = отрисовать([
      { block: "Header", props: { ...базаHeader, ...ВКЛ } },
    ]);
    const токены = токеныКласса(html, "grid-cols-2 gap-x-8 gap-y-6 py-8");
    expect(токены).toContain("flux-container-designers");
    expect(токены).not.toContain("flux-container");
  });

  it("без признака — mega-menu контейнер несёт прежний класс flux-container, разметка байт в байт прежняя", () => {
    const [выкл, безПризнака] = отрисовать([
      { block: "Header", props: базаHeader },
      { block: "Header", props: { ...базаHeader, __designParity: false } },
    ]);
    const токены = токеныКласса(выкл, "grid-cols-2 gap-x-8 gap-y-6 py-8");
    expect(токены).toContain("flux-container");
    expect(токены).not.toContain("flux-container-designers");
    expect(выкл).toContain("max-w-[1920px]");
    expect(безПризнака).toEqual(выкл);
  });
});

describe("flux: Hero — первый экран как у верстальщиков под PARITY_DESIGN", () => {
  const ФОТО = "/images/hero-photo.webp";
  const ПОЛНАЯ = {
    id: "Hero-1",
    colorScheme: "scheme-1",
    heading: { text: "Заголовок" },
    text: { content: "Текст" },
    backgroundImages: { url1: ФОТО },
  };

  /** Классы <section> полотна (несёт heroHeightMdCls). */
  function классыПолотна(html: string): string[] {
    const m = html.match(
      /<section class="(relative w-full overflow-hidden[^"]*)"/,
    );
    expect(m).not.toBeNull();
    return m![1].split(/\s+/);
  }

  /** Классы тега <img>, у которого src — наше фото. */
  function классыФото(html: string): string[] {
    const тег = [...html.matchAll(/<img\b[^>]*>/g)]
      .map((mm) => mm[0])
      .find((t) => t.includes(ФОТО));
    expect(тег).toBeDefined();
    return (тег!.match(/class="([^"]*)"/)?.[1] ?? "").trim().split(/\s+/);
  }

  it("«Размер» по умолчанию (large) — первая ступень высоты на sm:, не md:", () => {
    const [html] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ } },
    ]);
    const полотно = классыПолотна(html);
    for (const к of [
      "h-[380px]",
      "sm:h-[480px]",
      "lg:aspect-[1920/810]",
      "lg:h-auto",
    ]) {
      expect(полотно).toContain(к);
    }
    expect(полотно).not.toContain("md:h-[480px]");
  });

  it("крой одного фото — калибровка с базового брейкпоинта, sm:w-[160%], lg: как раньше", () => {
    const [html] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ } },
    ]);
    const фото = классыФото(html);
    for (const к of [
      "absolute",
      "left-1/2",
      "top-[-10.8%]",
      "h-auto",
      "w-[200%]",
      "max-w-none",
      "-translate-x-1/2",
      "sm:w-[160%]",
      "lg:left-0",
      "lg:w-full",
      "lg:translate-x-0",
    ]) {
      expect(фото).toContain(к);
    }
    expect(фото).not.toContain("size-full");
    expect(фото).not.toContain("md:absolute");
  });

  it("«Средний» и «Маленький» не зависят от признака (у верстальщиков контрола «Размер» нет)", () => {
    const [срВкл, срВыкл, мВкл, мВыкл] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ, size: "medium" } },
      { block: "Hero", props: { ...ПОЛНАЯ, size: "medium" } },
      { block: "Hero", props: { ...ПОЛНАЯ, ...ВКЛ, size: "small" } },
      { block: "Hero", props: { ...ПОЛНАЯ, size: "small" } },
    ]);
    expect(срВкл).toEqual(срВыкл);
    expect(мВкл).toEqual(мВыкл);
  });

  it("остальные настройки (положение/контейнер/overlay) по-прежнему меняют секцию", () => {
    const база = { ...ПОЛНАЯ, ...ВКЛ };
    const [исходная, ...варианты] = отрисовать([
      { block: "Hero", props: база },
      { block: "Hero", props: { ...база, position: "top-right" } },
      { block: "Hero", props: { ...база, container: "true" } },
      { block: "Hero", props: { ...база, overlay: 50 } },
    ]);
    for (const v of варианты) expect(v).not.toEqual(исходная);
  });

  it("без признака — байт в байт прежняя разметка (лестница md:, крой md:absolute)", () => {
    const [безПризнака, выкл] = отрисовать([
      { block: "Hero", props: { ...ПОЛНАЯ, __designParity: false } },
      { block: "Hero", props: ПОЛНАЯ },
    ]);
    expect(безПризнака).toEqual(выкл);
    const полотно = классыПолотна(выкл);
    expect(полотно).toContain("md:h-[480px]");
    expect(полотно).not.toContain("sm:h-[480px]");
    const фото = классыФото(выкл);
    expect(фото).toContain("size-full");
    expect(фото).toContain("md:absolute");
  });
});
