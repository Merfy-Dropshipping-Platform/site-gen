/**
 * «Изображение с текстом» (bloom) — инвентарь ВСЕХ параметров панели.
 *
 * Зачем отдельно от bloom-image-with-text-layout.spec.ts: тот сторожит только
 * тумблер «Контейнер» (вкл/выкл, width, position, легаси layout). Владелец
 * 2026-09-21: «важно проверить работоспособность и остальных параметров этой
 * секции» — то есть каждый контрол панели обязан доезжать до разметки, а не
 * только те три, которые правились последними.
 *
 * Класс бага, который это ловит, у нас уже был не раз: поле в панели есть,
 * порт его не читает, мерчант крутит контрол и ничего не происходит (§12
 * контракта секции, docs/theme-work/SECTION-CONTRACT.md). Здесь на каждый
 * параметр — проверка «два разных значения дают РАЗНУЮ разметку» плюс, где
 * уместно, конкретный ожидаемый класс.
 *
 * Замер, с которого снят этот инвентарь (2026-09-21, Chromium 1280, порт из
 * dist/theme-sections/bloom — тот же модуль, что уходит на витрину):
 *   • живые: containerEnabled, width, size, imagePosition, position,
 *     colorScheme, containerColorScheme, ctaPosition, textStyle, padding,
 *     heading.size, text.size, button.link, hiddenFields;
 *   • ПОЛУЖИВОЙ: alignment — выключка приезжала ТОЛЬКО на заголовок, текст и
 *     кнопка оставались слева (проверки ниже требуют все три — до починки
 *     они красные, и это их работа).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections bloom.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const BLOCK = "ImageWithText";
const MANIFEST = resolve(
  SITES_ROOT,
  "dist",
  "theme-sections",
  "bloom",
  "manifest.json",
);

const built = existsSync(MANIFEST);

/** Пропы, общие для всех прогонов: заполненная секция без пустых состояний. */
const BASE = {
  id: "iwt-1",
  image: { url: "/photo.jpg", alt: "" },
  heading: { text: "Суть красоты" },
  text: { content: "Описание бренда" },
  button: { text: "К продукции" },
};

/** Один прогон порта темы. Возвращает HTML секции. */
function render(props: Record<string, unknown>): string {
  const rows = JSON.parse(
    execFileSync(
      "node",
      [
        RENDERER,
        "bloom",
        JSON.stringify([{ block: BLOCK, props: { ...BASE, ...props } }]),
      ],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

/** class="…" того элемента, который несёт данный маркер. */
function classOf(html: string, marker: string): string {
  const i = html.indexOf(marker);
  if (i < 0) return "";
  const open = html.lastIndexOf("<", i);
  const tag = html.slice(open, html.indexOf(">", i) + 1);
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

/** Карточка = ближайший div-предок заголовка. */
function cardClass(html: string): string {
  const h = html.indexOf('data-puck-subsection-field="heading"');
  if (h < 0) return "";
  const open = html.lastIndexOf('<div class="', html.slice(0, h).length);
  const tag = html.slice(open, html.indexOf(">", open) + 1);
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

const photoClass = (html: string) =>
  classOf(html, 'data-puck-subsection-field="image"');
const headingClass = (html: string) =>
  classOf(html, 'data-puck-subsection-field="heading"');
const textClass = (html: string) =>
  classOf(html, 'data-puck-subsection-field="text"');

describe("«Изображение с текстом» (bloom) — инвентарь параметров", () => {
  it("порт темы нарезан (без dist проверять нечего)", () => {
    expect(built).toBe(true);
  });

  // ── Контейнер: тумблер наложения ──────────────────────────────────────
  it("Наложение: 'true' кладёт плашку поверх медиа, 'false' ставит пару рядом", () => {
    if (!built) return;
    expect(cardClass(render({ containerEnabled: "true" }))).toContain(
      "lg:absolute",
    );
    expect(cardClass(render({ containerEnabled: "false" }))).not.toContain(
      "lg:absolute",
    );
  });

  it("Наложение принимает и boolean, и строку (§5 контракта)", () => {
    if (!built) return;
    expect(cardClass(render({ containerEnabled: true }))).toContain(
      "lg:absolute",
    );
    expect(cardClass(render({ containerEnabled: false }))).not.toContain(
      "lg:absolute",
    );
  });

  // ── Ширина ────────────────────────────────────────────────────────────
  it("Ширина: три значения дают три РАЗНЫЕ ширины карточки", () => {
    if (!built) return;
    const w = (width: string) =>
      cardClass(render({ containerEnabled: "true", width }));
    const [s, m, l] = [w("small"), w("medium"), w("large")];
    expect(s).not.toEqual(m);
    expect(m).not.toEqual(l);
    expect(s).not.toEqual(l);
  });

  // ── Размер ────────────────────────────────────────────────────────────
  it("Размер: три значения дают три РАЗНЫХ пропорции фото", () => {
    if (!built) return;
    const a = (size: string) =>
      photoClass(render({ containerEnabled: "true", size }));
    const [s, m, l] = [a("small"), a("medium"), a("large")];
    expect(s).not.toEqual(m);
    expect(m).not.toEqual(l);
    expect(s).not.toEqual(l);
  });

  // ── Позиция фото ──────────────────────────────────────────────────────
  it("Позиция фото: карточка встаёт с противоположной стороны от фото", () => {
    if (!built) return;
    // Медиа стоит в потоке и отжато к своей стороне auto-margin'ом;
    // плашка — абсолютный слой, прижатый к противоположному краю пары.
    const right = render({ containerEnabled: "true", imagePosition: "right" });
    const left = render({ containerEnabled: "true", imagePosition: "left" });
    expect(photoClass(right)).toContain("lg:ml-auto");
    expect(cardClass(right)).toContain("lg:left-0");
    expect(photoClass(left)).toContain("lg:mr-auto");
    expect(cardClass(left)).toContain("lg:right-0");
  });

  it("Позиция фото работает и БЕЗ наложения (порядок колонок)", () => {
    if (!built) return;
    const right = render({ containerEnabled: "false", imagePosition: "right" });
    const left = render({ containerEnabled: "false", imagePosition: "left" });
    expect(photoClass(right)).not.toEqual(photoClass(left));
  });

  // ── Положение ─────────────────────────────────────────────────────────
  it("Положение при наложении — три разных якоря плашки", () => {
    if (!built) return;
    const a = (position: string) =>
      cardClass(render({ containerEnabled: "true", position }));
    expect(a("top")).toContain("lg:top-[3.3%]");
    expect(a("bottom")).toContain("lg:bottom-[3.3%]");
    expect(a("middle")).toContain("lg:-translate-y-1/2");
  });

  // ── Выравнивание ──────────────────────────────────────────────────────
  // §12 контракта: видимое поле обязано доезжать. Выключка секции-уровня
  // применяется к ЗАГОЛОВКУ, ТЕКСТУ и КНОПКЕ (паритет rose) — на 2026-09-21
  // порт bloom красил только заголовок.
  it.each(["center", "right"] as const)(
    "Выравнивание '%s' применяется к заголовку",
    (alignment) => {
      if (!built) return;
      expect(headingClass(render({ alignment }))).toContain(
        `text-${alignment}`,
      );
    },
  );

  it.each(["center", "right"] as const)(
    "Выравнивание '%s' применяется к ТЕКСТУ, а не только к заголовку",
    (alignment) => {
      if (!built) return;
      expect(textClass(render({ alignment }))).toContain(`text-${alignment}`);
    },
  );

  it("Выравнивание двигает и КНОПКУ", () => {
    if (!built) return;
    const left = render({ alignment: "left" });
    const right = render({ alignment: "right" });
    const wrap = (html: string) => {
      const i = html.indexOf('data-puck-subsection-field="button"');
      const open = html.lastIndexOf('<div class="', i);
      return (
        /class="([^"]*)"/.exec(
          html.slice(open, html.indexOf(">", open) + 1),
        )?.[1] ?? ""
      );
    };
    expect(wrap(left)).not.toEqual(wrap(right));
  });

  // ── Цветовые схемы ────────────────────────────────────────────────────
  it("Цветовая схема красит СЕКЦИЮ", () => {
    if (!built) return;
    expect(render({ colorScheme: "scheme-3" })).toContain("color-scheme-3");
  });

  it("Схема контейнера красит КАРТОЧКУ и только при включённом контейнере", () => {
    if (!built) return;
    expect(
      cardClass(
        render({ containerEnabled: "true", containerColorScheme: "scheme-2" }),
      ),
    ).toContain("color-scheme-2");
    expect(
      cardClass(
        render({ containerEnabled: "false", containerColorScheme: "scheme-2" }),
      ),
    ).not.toContain("color-scheme-2");
  });

  // ── Скрытые поля панели ───────────────────────────────────────────────
  it("Позиция кнопки: 'inline' и 'bottom-pinned' дают разную обвязку", () => {
    if (!built) return;
    const inline = render({ containerEnabled: "true", ctaPosition: "inline" });
    const pinned = render({
      containerEnabled: "true",
      ctaPosition: "bottom-pinned",
    });
    expect(inline).toContain('class="mt-2"');
    expect(pinned).toContain('class="mt-auto"');
  });

  it("Начертание: 'italic' включает курсив заголовка и текста", () => {
    if (!built) return;
    const html = render({ textStyle: "italic" });
    expect(headingClass(html)).toContain("italic");
    expect(textClass(html)).toContain("italic");
  });

  // ── Отступы ───────────────────────────────────────────────────────────
  it("Отступы приезжают инлайн-стилем секции", () => {
    if (!built) return;
    const html = render({ padding: { top: 24, bottom: 48 } });
    expect(html).toContain("padding-top:24px");
    expect(html).toContain("padding-bottom:48px");
  });

  // ── Подпанели ─────────────────────────────────────────────────────────
  it("Размер заголовка: три ступени, кегль монотонно растёт", () => {
    if (!built) return;
    const px = (size: string) => {
      const cls = headingClass(
        render({ heading: { text: "Заголовок", size } }),
      );
      return Number(/text-\[(\d+)px\]/.exec(cls)?.[1] ?? 0);
    };
    expect(px("small")).toBeLessThan(px("medium"));
    expect(px("medium")).toBeLessThan(px("large"));
  });

  it("Размер текста: три ступени, кегль монотонно растёт", () => {
    if (!built) return;
    const px = (size: string) => {
      const cls = textClass(render({ text: { content: "Текст", size } }));
      return Number(/text-\[(\d+)px\]/.exec(cls)?.[1] ?? 0);
    };
    expect(px("small")).toBeLessThan(px("medium"));
    expect(px("medium")).toBeLessThan(px("large"));
  });

  it("Ссылка кнопки: выбор мерчанта побеждает легаси-дефолт href", () => {
    if (!built) return;
    const html = render({
      button: {
        text: "Жми",
        href: "/about",
        link: { href: "/collections/pomada" },
      },
    });
    expect(html).toContain('href="/collections/pomada"');
  });

  // ── Заглушки и скрытие ────────────────────────────────────────────────
  it("Пустой заголовок = «не задано» → заглушка, а не пустой <h2> (§2 контракта)", () => {
    if (!built) return;
    const html = render({ heading: { text: "" } });
    expect(html).toContain("Изображение с текстом");
  });

  it("Скрытое «глазом» поле не рендерится вовсе", () => {
    if (!built) return;
    const html = render({ hiddenFields: ["image"] });
    expect(html).not.toContain('data-puck-subsection-field="image"');
  });
});

/**
 * Геометрия наложения — эталон владельца от 2026-09-21 (шесть снимков).
 *
 * Замер PIL по розовой плашке и кромке фото (вьюпорт снимка 1280):
 *   Ширина=Большая   карточка 655, фото 287, пара 876, наезд 66
 *   Ширина=Средняя   карточка 508, пара та же
 *   Ширина=Маленькая карточка 358, фото 582, пара 875, наезд 65
 * Отсюда доли: карточка 40/58/75 %, фото 67.5/49.5/32.5 %, сумма 107.5 % —
 * наезд ровно 7.5 % ширины пары, и ширина пары от «Ширины» НЕ зависит.
 *
 * До 2026-09-21 было иначе: фото занимало пару целиком, карточка плавала
 * внутри него абсолютом, а «Ширина» ужимала заодно и фото (замер Chromium
 * 1280: пара 1120/1080/780 вместо постоянной). Проверки ниже держат эталон.
 */
describe("«Изображение с текстом» (bloom) — геометрия наложения по эталону", () => {
  const card = (props: Record<string, unknown>) =>
    cardClass(render({ containerEnabled: "true", ...props }));
  const photo = (props: Record<string, unknown>) =>
    photoClass(render({ containerEnabled: "true", ...props }));
  const pct = (cls: string) => Number(/lg:w-\[([\d.]+)%\]/.exec(cls)?.[1] ?? 0);

  it("карточка и фото ДЕЛЯТ ширину пары — ни одно не занимает её целиком", () => {
    if (!built) return;
    for (const width of ["small", "medium", "large"]) {
      expect(pct(card({ width }))).toBeGreaterThan(0);
      expect(pct(photo({ width }))).toBeGreaterThan(0);
      expect(pct(card({ width }))).toBeLessThan(100);
      expect(pct(photo({ width }))).toBeLessThan(100);
    }
  });

  it("сумма долей даёт наезд, и наезд ОДИНАКОВ при всех трёх «Ширинах»", () => {
    if (!built) return;
    const overlap = (width: string) =>
      Math.round((pct(card({ width })) + pct(photo({ width })) - 100) * 10) /
      10;
    expect(overlap("small")).toBeCloseTo(7.5, 1);
    expect(overlap("medium")).toBeCloseTo(7.5, 1);
    expect(overlap("large")).toBeCloseTo(7.5, 1);
  });

  // Эталон 22.09 (два снимка с одним «Размером»): Большая — медиа 585 и
  // плашка 359; Средняя — медиа 434 и плашка 508. «Большая» растит МЕДИА.
  it("«Ширина» растит медиа и ровно настолько же ужимает плашку", () => {
    if (!built) return;
    expect(pct(photo({ width: "small" }))).toBeLessThan(
      pct(photo({ width: "medium" })),
    );
    expect(pct(photo({ width: "medium" }))).toBeLessThan(
      pct(photo({ width: "large" })),
    );
    expect(pct(card({ width: "small" }))).toBeGreaterThan(
      pct(card({ width: "medium" })),
    );
    expect(pct(card({ width: "medium" }))).toBeGreaterThan(
      pct(card({ width: "large" })),
    );
  });

  it("ширина ПАРЫ от «Ширины» не зависит (на эталоне она 875-876 при всех трёх)", () => {
    if (!built) return;
    const outer = (width: string) => {
      const html = render({ containerEnabled: "true", width });
      return /max-w-\[\d+px\]|max-w-none/.exec(
        /<div[^>]*class="([^"]*grid|[^"]*flex)[^"]*"/.exec(html)?.[0] ?? "",
      )?.[0];
    };
    expect(outer("small")).toEqual(outer("medium"));
    expect(outer("medium")).toEqual(outer("large"));
  });

  it("медиа стоит в потоке и своей пропорцией задаёт высоту пары", () => {
    if (!built) return;
    const cls = photo({});
    expect(cls).not.toContain("lg:absolute");
    // Пропорция «Размера» остаётся на медиа — именно она даёт высоту.
    expect(cls).toMatch(/aspect-\[|aspect-square/);
  });

  it("плашка — абсолютный слой поверх медиа", () => {
    if (!built) return;
    expect(card({})).toContain("lg:absolute");
  });

  it("«Размер» меняет пропорцию медиа — три разные ступени", () => {
    if (!built) return;
    const a = (size: string) =>
      /aspect-\[[^\]]+\]|aspect-square/.exec(photo({ size }))?.[0];
    expect(a("small")).toBeDefined();
    expect(a("small")).not.toEqual(a("medium"));
    expect(a("medium")).not.toEqual(a("large"));
    expect(a("small")).not.toEqual(a("large"));
  });

  it("отдельной нижней границы высоты больше нет — её задаёт медиа", () => {
    if (!built) return;
    expect(render({ containerEnabled: "true" })).not.toMatch(/lg:min-h-\[/);
  });

  it("на мобильном наложения нет — пара идёт столбиком", () => {
    if (!built) return;
    // Все классы наложения — с префиксом lg:. Ни один не должен быть безусловным.
    const cls = `${card({})} ${photo({})}`;
    for (const utility of [
      "absolute",
      "inset-y-0",
      "right-0",
      "left-0",
      "my-10",
    ]) {
      const bare = new RegExp(
        `(^|\\s)${utility.replace(/[[\]]/g, "\\$&")}(\\s|$)`,
      );
      expect(cls).not.toMatch(bare);
    }
  });

  it("без наложения раскладка прежняя — две колонки, никаких абсолютов", () => {
    if (!built) return;
    const html = render({ containerEnabled: "false" });
    expect(html).toContain("lg:grid-cols-2");
    expect(photoClass(html)).not.toContain("lg:absolute");
    expect(cardClass(html)).not.toContain("lg:absolute");
  });
});

/**
 * Требования владельца 2026-09-22, дословно: «для телефона не влияет
 * настройки Ширина и позиция как с наложением, так и без него» и «под размер
 * медиафайла без контейнера меняется высота вот этой части, где нет медиа».
 *
 * Первое проверяется составом классов: всё, что двигает пару, обязано нести
 * префикс `lg:` — иначе оно доживёт до 375px. Второе — тем, что колонки без
 * наложения тянутся на одну высоту (`items-stretch` + `lg:h-full`), а не
 * центрируются каждая по своему содержимому.
 */
describe("«Изображение с текстом» (bloom) — телефон и высота без наложения", () => {
  const bare = (cls: string, utility: string) =>
    new RegExp(`(^|\\s)${utility}(\\s|$)`).test(cls);

  it.each(["true", "false"])(
    "containerEnabled=%s: ни один класс раскладки не доживает до телефона",
    (containerEnabled) => {
      if (!built) return;
      for (const width of ["small", "medium", "large"]) {
        for (const position of ["top", "middle", "bottom"]) {
          const html = render({ containerEnabled, width, position });
          const cls = `${cardClass(html)} ${photoClass(html)} ${html}`;
          // Доли, якоря и выключка пары — только под lg.
          for (const u of [
            "w-[32.5%]",
            "w-[49.5%]",
            "w-[67.5%]",
            "w-[40%]",
            "w-[58%]",
            "w-[75%]",
          ]) {
            expect(bare(cls, u.replace(/[[\]().%]/g, "\\$&"))).toBe(false);
          }
          for (const u of [
            "items-start",
            "items-end",
            "items-center",
            "items-stretch",
            "absolute",
          ]) {
            expect(bare(cardClass(html), u)).toBe(false);
          }
        }
      }
    },
  );

  it("без наложения колонки тянутся на одну высоту — «Размер» двигает и текст", () => {
    if (!built) return;
    const html = render({ containerEnabled: "false" });
    expect(html).toContain("lg:items-stretch");
    expect(cardClass(html)).toContain("lg:h-full");
    // Прежний `items-center` оставлял текстовую колонку по её содержимому.
    expect(html).not.toContain("lg:items-center");
  });

  it("«Положение» без наложения выравнивает содержимое внутри колонки", () => {
    if (!built) return;
    const j = (position: string) =>
      /lg:justify-(start|center|end)/.exec(
        cardClass(render({ containerEnabled: "false", position })),
      )?.[0];
    expect(j("top")).toBe("lg:justify-start");
    expect(j("middle")).toBe("lg:justify-center");
    expect(j("bottom")).toBe("lg:justify-end");
  });
});
