import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * satin, пакет замечаний тестера 24.09. Гард рендерит живой порт темы (та же
 * лестница, что у витрины) и смотрит разметку секции.
 *
 * 1. «Шапка → Боковое: бургер слева». Замер пяти тем (375/768/1440 × четыре
 *    положения логотипа): на телефоне бургер слева у всех пяти, на десктопе —
 *    справа, последним в группе иконок, тоже у всех пяти (канон владельца
 *    21.09, гард header-burger-position). satin уже как остальные — здесь
 *    пинится, что телефонная строка начинается с бургера, а десктопный бургер
 *    стоит в группе иконок.
 * 2. «Изображение с текстом»: текст стоял НАД заголовком. Теперь заголовок,
 *    текст, кнопка — как в панели и в остальных темах; индексы подпунктов те
 *    же, что у левой панели конструктора (100 изображение … 103 кнопка).
 * 3. «Слайд-шоу ▸ слайд»: то же — заголовок над текстом.
 * 4. «Слайд-шоу ▸ слайд»: пустое поле «Кнопка» скрывает кнопку, даже когда в
 *    слайде лежит легаси `ctaText` из засева.
 * 5. «Мультиряды ▸ Выбор кнопки»: «Основная» берёт «Основную кнопку» схемы,
 *    «Белая» — «Дополнительную», а не светлый контур.
 */
const КАТАЛОГ = { products: [], collections: [], publications: [] };

const render = (block: string, props: Record<string, unknown>): string => {
  const [r] = renderSections("satin", [
    { block, props: { id: `${block}-1`, ...props }, catalog: КАТАЛОГ },
  ]);
  if (!r.html) throw new Error(`${block} не отрисовался: ${r.error ?? "?"}`);
  return r.html;
};

/** Позиции в разметке: где стоит тег с данным полем подпункта. */
const at = (html: string, field: string): number =>
  html.search(new RegExp(`data-puck-subsection-field="${field}"`));

/** Кнопки-ссылки секции с их классами. */
const links = (html: string): Array<{ cls: string; text: string }> =>
  Array.from(html.matchAll(/<a\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)).map((m) => ({
    cls: m[1],
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));

/**
 * Стартовые пропы панели — ровно то, что конструктор получает по
 * `GET /api/themes/satin/puck-config` и вставляет новой секцией. Дочерний
 * процесс — как у slideshow-slide-panel: контроллер тянет ESM-модули блоков,
 * а jest (CJS) на них падает. Требует pnpm build && pnpm build:blocks.
 */
const panelDefaults: Record<string, Record<string, unknown>> = (() => {
  const raw = execFileSync("node", [resolve(__dirname, "puck-config-raw.mjs"), "satin"], {
    cwd: resolve(__dirname, "..", "..", ".."),
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const cfg = JSON.parse(raw) as { components: Record<string, { defaultProps?: Record<string, unknown> }> };
  return Object.fromEntries(
    ["ImageWithText", "Slideshow", "MultiRows"].map((t) => [t, cfg.components[t]?.defaultProps ?? {}]),
  );
})();

describe("пункт 1: бургер «Бокового» меню стоит как в остальных темах", () => {
  const html = () => render("Header", { siteTitle: "Satin", menuType: "sidebar" });

  it("телефонная строка начинается с бургера, логотип — после него", () => {
    const h = html();
    const burger = h.indexOf('id="satin-burger-btn"');
    const logo = h.indexOf('href="/"', burger);
    expect(burger).toBeGreaterThan(-1);
    expect(logo).toBeGreaterThan(burger);
  });

  it("десктопный бургер — в группе иконок: перед ним «Корзина», логотипа между ними нет", () => {
    const h = html();
    // Десктопные бургеры — все, кроме телефонного (id) и крестика шторки.
    const desktop = Array.from(h.matchAll(/<button\b[^>]*data-burger-toggle[^>]*>/g)).filter(
      (m) => !m[0].includes('id="satin-burger-btn"') && !m[0].includes("data-burger-close"),
    );
    expect(desktop.length).toBeGreaterThan(0);
    for (const m of desktop) {
      const before = h.slice(0, m.index);
      const cart = before.lastIndexOf('aria-label="Корзина"');
      expect(cart).toBeGreaterThan(-1);
      expect(before.slice(cart)).not.toMatch(/<a\s[^>]*href="\/"/);
    }
  });
});

describe("пункт 2: «Изображение с текстом» — заголовок, текст, кнопка", () => {
  it.each([
    ["пустая (новая) секция", () => panelDefaults.ImageWithText],
    ["заполненная", () => ({ ...panelDefaults.ImageWithText, heading: "Мой заголовок", text: "Мой текст", button: { text: "Купить", link: "/catalog" } })],
  ])("%s: заголовок выше текста, кнопка последней", (_name, props) => {
    const h = render("ImageWithText", props());
    expect(at(h, "heading")).toBeGreaterThan(-1);
    expect(at(h, "text")).toBeGreaterThan(at(h, "heading"));
    expect(at(h, "button")).toBeGreaterThan(at(h, "text"));
  });

  it("индексы подпунктов — как у левой панели конструктора", () => {
    const h = render("ImageWithText", panelDefaults.ImageWithText);
    const index = (field: string) =>
      new RegExp(`data-puck-subsection-index="(\\d+)"\\s+data-puck-subsection-field="${field}"`).exec(h)?.[1];
    expect({ image: index("image"), heading: index("heading"), text: index("text"), button: index("button") }).toEqual({
      image: "100",
      heading: "101",
      text: "102",
      button: "103",
    });
  });
});

const slide = (extra: Record<string, unknown>) => ({
  id: "s1",
  image: "",
  heading: { text: "Заголовок слайда", size: "medium" },
  text: { content: "Текст слайда", size: "medium" },
  ...extra,
});

describe("пункт 3: слайд — заголовок над текстом", () => {
  it.each([
    ["пустая (новая) секция", () => panelDefaults.Slideshow],
    ["заполненная", () => ({ ...panelDefaults.Slideshow, slides: [slide({ button: { text: "Смотреть", link: "/catalog" } })] })],
  ])("%s", (_name, props) => {
    const h = render("Slideshow", props());
    expect(at(h, "heading")).toBeGreaterThan(-1);
    expect(at(h, "text")).toBeGreaterThan(at(h, "heading"));
  });
});

describe("пункт 4: пустое поле «Кнопка» слайда скрывает кнопку", () => {
  const ctas = (props: Record<string, unknown>) =>
    links(render("Slideshow", props)).filter((l) => /satin-slide-cta|button-2-bg/.test(l.cls));

  it("заполненная: кнопка с текстом поля", () => {
    const got = ctas({ ...panelDefaults.Slideshow, slides: [slide({ button: { text: "Смотреть", link: "/catalog" } })] });
    expect(got.map((l) => l.text)).toEqual(["Смотреть"]);
  });

  it("заполненная, поле очищено, а в слайде лежит легаси ctaText — кнопки нет", () => {
    const got = ctas({
      ...panelDefaults.Slideshow,
      slides: [slide({ button: { text: "", link: "/catalog" }, ctaText: "Кнопка", ctaUrl: "/catalog" })],
    });
    expect(got).toEqual([]);
  });

  it("новая секция: очистили поле в засеянном слайде — кнопки нет", () => {
    const seeded = (panelDefaults.Slideshow.slides as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      button: { text: "   " },
    }));
    expect(ctas({ ...panelDefaults.Slideshow, slides: seeded })).toEqual([]);
  });

  it("старый слайд без поля панели — легаси ctaText по-прежнему рисуется", () => {
    const got = ctas({ ...panelDefaults.Slideshow, slides: [slide({ ctaText: "Старая", ctaUrl: "/catalog" })] });
    expect(got.map((l) => l.text)).toEqual(["Старая"]);
  });
});

describe("пункт 5: «Мультиряды ▸ Выбор кнопки» — цвета из схемы", () => {
  const rowButton = (buttonStyle: unknown) =>
    links(render("MultiRows", { ...panelDefaults.MultiRows, buttonStyle }))[0]?.cls ?? "";
  const PRIMARY = /bg-\[rgb\(var\(--color-button-bg,[^)]*\)\)\].*text-\[rgb\(var\(--color-button-text,/;
  const SECONDARY = /bg-\[rgb\(var\(--color-button-2-bg,[^)]*\)\)\].*text-\[rgb\(var\(--color-button-2-text,/;

  it.each([
    ["Основная", "primary", PRIMARY],
    ["Чёрная", "black", PRIMARY],
    ["Белая", "white", SECONDARY],
    ["без значения — как «Основная» панели", undefined, PRIMARY],
  ])("%s", (_label, value, role) => {
    const cls = rowButton(value);
    expect(cls).toMatch(role);
    expect(cls).not.toContain("bg-transparent");
  });

  it("дефолт панели — «Основная», и рисуется заливкой основной кнопки", () => {
    expect(panelDefaults.MultiRows.buttonStyle).toBe("primary");
    expect(rowButton(panelDefaults.MultiRows.buttonStyle)).toMatch(PRIMARY);
  });
});
