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
  it("Контейнер: 'true' включает наложение, 'false' ставит пару встык", () => {
    if (!built) return;
    expect(photoClass(render({ containerEnabled: "true" }))).toContain(
      "lg:absolute",
    );
    expect(photoClass(render({ containerEnabled: "false" }))).not.toContain(
      "lg:absolute",
    );
  });

  it("Контейнер принимает и boolean, и строку (§5 контракта)", () => {
    if (!built) return;
    expect(photoClass(render({ containerEnabled: true }))).toContain(
      "lg:absolute",
    );
    expect(photoClass(render({ containerEnabled: false }))).not.toContain(
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
    // Фото прижато к своей стороне пары, карточка отжата к противоположной.
    const right = render({ containerEnabled: "true", imagePosition: "right" });
    const left = render({ containerEnabled: "true", imagePosition: "left" });
    expect(photoClass(right)).toContain("lg:right-0");
    expect(cardClass(right)).toContain("lg:mr-auto");
    expect(photoClass(left)).toContain("lg:left-0");
    expect(cardClass(left)).toContain("lg:ml-auto");
  });

  it("Позиция фото работает и БЕЗ наложения (порядок колонок)", () => {
    if (!built) return;
    const right = render({ containerEnabled: "false", imagePosition: "right" });
    const left = render({ containerEnabled: "false", imagePosition: "left" });
    expect(photoClass(right)).not.toEqual(photoClass(left));
  });

  // ── Положение ─────────────────────────────────────────────────────────
  it("Положение: сверху / по центру / снизу — три разные выключки пары", () => {
    if (!built) return;
    const p = (position: string) =>
      /lg:items-(start|center|end)/.exec(
        render({ containerEnabled: "true", position }),
      )?.[0];
    expect(p("top")).toBe("lg:items-start");
    expect(p("middle")).toBe("lg:items-center");
    expect(p("bottom")).toBe("lg:items-end");
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

  it("«Ширина» растит карточку и ровно настолько же ужимает фото", () => {
    if (!built) return;
    expect(pct(card({ width: "small" }))).toBeLessThan(
      pct(card({ width: "medium" })),
    );
    expect(pct(card({ width: "medium" }))).toBeLessThan(
      pct(card({ width: "large" })),
    );
    expect(pct(photo({ width: "small" }))).toBeGreaterThan(
      pct(photo({ width: "medium" })),
    );
    expect(pct(photo({ width: "medium" }))).toBeGreaterThan(
      pct(photo({ width: "large" })),
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

  it("фото прижато к своей стороне и растянуто на высоту пары", () => {
    if (!built) return;
    const right = photo({ imagePosition: "right" });
    expect(right).toContain("lg:absolute");
    expect(right).toContain("lg:inset-y-0");
    expect(right).toContain("lg:right-0");
    expect(photo({ imagePosition: "left" })).toContain("lg:left-0");
  });

  it("карточка стоит в потоке и оставляет фото вертикальный вылет", () => {
    if (!built) return;
    const cls = card({});
    expect(cls).not.toContain("lg:absolute");
    expect(cls).toMatch(/lg:my-\d+/);
  });

  it("«Размер» держит нижнюю границу высоты пары — три разные ступени", () => {
    if (!built) return;
    const minh = (size: string) => {
      const html = render({ containerEnabled: "true", size });
      return /lg:min-h-\[(\d+)px\]/.exec(html)?.[1];
    };
    expect(minh("small")).toBeDefined();
    expect(Number(minh("small"))).toBeLessThan(Number(minh("medium")));
    expect(Number(minh("medium"))).toBeLessThan(Number(minh("large")));
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
