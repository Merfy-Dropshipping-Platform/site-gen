/**
 * Подписи подпанелей секции «Товар» обязаны доезжать до витрины.
 *
 * Баг-репорт тестировщика 2026-09-13 (магазин 7b64b7a527d2, тема rose),
 * пункты T2/T3/T4 — три жалобы ОДНОГО класса: «значение сохраняется, тема его
 * не выводит».
 *   T2 «Кнопки → Основная кнопка → Текст»     — ввёл «ПОЛОЖИТЬ В КОРЗИНУ»,
 *      на витрине «Добавить в корзину»; очистил поле (плейсхолдер обещает
 *      «Оставьте пустой, чтобы скрыть») — кнопка осталась.
 *   T2 «Кнопки → Динамическая кнопка → Текст» — ввёл «КУПИТЬ В 1 КЛИК»,
 *      на витрине «Купить сейчас», хэш HTML не сдвинулся.
 *   T3 «Поделиться → Текст»                    — ввёл «РАССКАЗАТЬ ДРУГУ»,
 *      на витрине прежняя подпись.
 *   T4 «Текст»                                 — ввёл «ПРОВЕРКА ТЕКСТА»,
 *      на странице текста нет нигде, а рядом живёт «Размер текста».
 *
 * ЗАМЕР «ДО» (рендер живой цепочкой, 2026-09-13, `render-theme-sections.mjs`
 * с `live:true` — пять тем, пары «тема × поле»):
 *   rose / vanilla / satin / bloom — addToCart=нет, «пусто скрывает»=нет,
 *                                    buyNow=нет, share=нет, text=нет,
 *                                    text.size=нет;
 *   flux                           — то же, кроме text (порт flux читает и
 *                                    плоскую строку, поэтому бренд-строка жила).
 *   Плюс «Цветовая схема» секции: класс `color-scheme-N` не печатался ни в
 *   одной из четырёх тем общего порта (flux печатал — он приводит значение
 *   к строке сам).
 *
 * ПРИЧИНА (найдена замером, не чтением): подпанели «Товара» — ОБЪЕКТЫ
 * (`ProductSchema`: text {content,size}, buttons {addToCart{text},buyNow{text}},
 * share {text}, description {content,size}), а `adaptLegacyProps` отправляла
 * «Товар» в общий коэрсер `coerceGenericLegacyProps`. Тот схлопывает ЛЮБОЙ
 * конверт `{text|content, size?, enabled?, alignment?}` в голую строку, чтобы
 * шаблоны не печатали «[object Object]»:
 *      { text: { content: 'X', size: 'large' } }  →  { text: 'X' }
 *      { share: { text: 'Y' } }                   →  { share: 'Y' }
 *      { buttons: { addToCart: { text: 'Z' } } }  →  { buttons: { addToCart: 'Z' } }
 * После этого `text?.content`, `share?.text`, `buttons?.addToCart?.text` в
 * ОБОИХ портах секции возвращают undefined — порт читает канон-форму, а до него
 * доезжает плоская строка. Заодно терялся `text.size` («Размер текста» —
 * настройка размера у несуществующего текста).
 *
 * Портов у секции два, и оба обязаны выполнять один контракт (авторитет —
 * dist/theme-sections/<тема>/manifest.json):
 *   • packages/theme-base/blocks/Product/Product.astro          — rose, bloom, satin, vanilla
 *   • themes/flux/src/components/sections/FeaturedProduct.astro — flux
 *
 * Проверка идёт ДВУМЯ слоями, потому что баг жил на стыке:
 *   1) unit — `adaptLegacyProps` обязана отдавать канон-ФОРМУ (слой, который
 *      ломал всё);
 *   2) рендер — пять тем, ЖИВАЯ цепочка (adaptLegacyProps →
 *      deepMergeBlockProps(theme.json) → resolveBlockProps → модуль темы),
 *      ровно та, которую проходит витрина и точечный hot-render конструктора.
 *      Grep по исходнику тут бесполезен: оба порта ЧИТАЛИ правильные пути и
 *      всё равно показывали дефолт.
 *
 * Рендер требует сборки (тот же порядок, что в CI перед этим шагом):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { adaptLegacyProps } from "../page-blocks";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Собственный порт есть только у flux; остальные четыре рендерят theme-base. */
const pkgFor = (theme: Theme) => (theme === "flux" ? undefined : "theme-base");

const MARK = {
  addToCart: "ЖМИ_СЮДА_МАЯЧОК",
  buyNow: "КУПИТЬ_В_1_КЛИК_МАЯЧОК",
  share: "РАССКАЗАТЬ_ДРУГУ_МАЯЧОК",
  text: "ПРОВЕРКА_ТЕКСТА_МАЯЧОК",
} as const;

const DEFAULT_LABELS = {
  addToCart: "Добавить в корзину",
  buyNow: "Купить сейчас",
  share: "Поделиться",
} as const;

/** Маркеры кнопки «в корзину» в разметке обоих портов. */
const ADD_MARKERS = ['data-product-action="add-to-cart"', "data-cfg-add"];

const base = {
  id: "Product-1",
  productId: "",
  colorScheme: "scheme-1",
  padding: { top: 40, bottom: 40 },
};

/** Один рендер живой цепочкой. Возвращает HTML или бросает с причиной. */
function renderLive(theme: Theme, props: Record<string, unknown>): string {
  const jobs = [{ block: "Product", pkg: pkgFor(theme), props, live: true }];
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(out) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Товар» (${theme}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  return row.html;
}

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

/**
 * Только разметка, без инлайн-скриптов гидрации.
 *
 * Скрипт секции держит и селекторы кнопок (`[data-product-action="add-to-cart"]`,
 * `[data-cfg-add]`), и слова «Добавить в корзину» в комментариях. Проверять
 * «кнопки нет» по сырому HTML — значит проверять текст скрипта, а не то, что
 * увидит покупатель.
 */
const markupOnly = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "");

// ───────────────────────── слой 1: форма пропсов ─────────────────────────

describe("adaptLegacyProps: подпанели «Товара» остаются объектами", () => {
  const canonical = {
    text: { content: MARK.text, size: "large" },
    description: { content: "Описание", size: "small" },
    share: { text: MARK.share },
    buttons: {
      addToCart: { text: MARK.addToCart },
      buyNow: { text: MARK.buyNow },
    },
  };
  const adapt = (props: Record<string, unknown>) =>
    adaptLegacyProps(props, null, "Product");

  it("«Текст» не схлопывается в строку и сохраняет «Размер текста»", () => {
    expect(adapt({ ...base, ...canonical }).text).toEqual({
      content: MARK.text,
      size: "large",
    });
  });

  it("«Поделиться» остаётся {text}", () => {
    expect(adapt({ ...base, ...canonical }).share).toEqual({
      text: MARK.share,
    });
  });

  it("«Кнопки» остаются {addToCart:{text}, buyNow:{text}}", () => {
    expect(adapt({ ...base, ...canonical }).buttons).toEqual({
      addToCart: { text: MARK.addToCart },
      buyNow: { text: MARK.buyNow },
    });
  });

  it("«Описание» остаётся {content,size}", () => {
    expect(adapt({ ...base, ...canonical }).description).toEqual({
      content: "Описание",
      size: "small",
    });
  });

  it("пустая подпись сохраняется как пустая строка, а не исчезает", () => {
    // Плейсхолдер «Основной кнопки» обещает «Оставьте пустой, чтобы скрыть».
    // Потеряется '' — порт увидит undefined и вернёт дефолтную подпись.
    expect(
      adapt({ ...base, buttons: { addToCart: { text: "" } } }).buttons,
    ).toEqual({ addToCart: { text: "" } });
  });

  it("легаси-ревизия с плоской строкой поднимается в канон-форму", () => {
    // Ревизии, сохранённые до подпанелей, держат голые строки. Порт читает
    // только канон-путь, поэтому поднимать их обязан адаптер, а не пять тем.
    const out = adapt({
      ...base,
      text: "СТАРЫЙ ТЕКСТ",
      share: "СТАРОЕ ПОДЕЛИТЬСЯ",
      badge: { text: "СТАРЫЙ БЕЙДЖ" },
      buttons: { addToCart: "СТАРАЯ КНОПКА" },
    });
    expect(out.text).toEqual({ content: "СТАРЫЙ ТЕКСТ" });
    expect(out.share).toEqual({ text: "СТАРОЕ ПОДЕЛИТЬСЯ" });
    expect(out.badge).toEqual({ text: "СТАРЫЙ БЕЙДЖ" });
    expect(out.buttons).toEqual({ addToCart: { text: "СТАРАЯ КНОПКА" } });
  });

  it("структурные поля «Товара» адаптер не трогает", () => {
    // Узость правки: она чинит ТОЛЬКО конверты подписей. Всё остальное —
    // «Варианты», «Количество», «Стоимость», «Название» — обязано доезжать
    // ровно тем же объектом, каким его прислала панель.
    const out = adapt({
      ...base,
      title: { size: "large" },
      price: { show: "false" },
      quantity: { enabled: "false" },
      variants: { displayStyle: "list", shape: "square" },
    });
    expect(out.title).toEqual({ size: "large" });
    expect(out.price).toEqual({ show: "false" });
    expect(out.quantity).toEqual({ enabled: "false" });
    expect(out.variants).toEqual({ displayStyle: "list", shape: "square" });
  });

  it("adaptLegacyProps идемпотентна (повторный проход ничего не ломает)", () => {
    const once = adapt({ ...base, ...canonical });
    const twice = adapt(once);
    expect(twice).toEqual(once);
  });

  it("САБОТАЖ: схлопнутая форма ловится — проверка не вырождена", () => {
    // Ровно то, что делал общий коэрсер до правки. Если кто-то вернёт «Товар»
    // в общую ветку, верхние проверки обязаны покраснеть — этот тест
    // доказывает, что предикат `toEqual(объект)` отличает объект от строки.
    const flattened: Record<string, unknown> = {
      text: MARK.text,
      share: MARK.share,
    };
    expect(flattened.text).not.toEqual({ content: MARK.text, size: "large" });
    expect(flattened.share).not.toEqual({ text: MARK.share });
  });

  it("другие блоки по-прежнему схлопываются (общая ветка не тронута)", () => {
    // Правка обязана быть узкой: конверт `{content,size}` у «Мультирядов» —
    // строка, и должен ею остаться, иначе шаблон напечатает [object Object].
    const out = adaptLegacyProps(
      { text: { content: "Текст", size: "large" } },
      null,
      "MultiRows",
    );
    expect(typeof out.text).toBe("string");
  });
});

// ───────────────────────── слой 2: рендер пяти тем ─────────────────────────

describe.each(THEMES)("«Товар» / %s: подписи доезжают до HTML", (theme) => {
  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built(theme)).toBe(true);
  });

  it("T2 «Основная кнопка → Текст» печатается на кнопке", () => {
    const html = markupOnly(
      renderLive(theme, {
        ...base,
        buttons: { addToCart: { text: MARK.addToCart } },
      }),
    );
    expect(html).toContain(MARK.addToCart);
    expect(html).not.toContain(DEFAULT_LABELS.addToCart);
  });

  it("T2 пустая «Основная кнопка» убирает кнопку", () => {
    const html = markupOnly(
      renderLive(theme, { ...base, buttons: { addToCart: { text: "" } } }),
    );
    expect(html).not.toContain(DEFAULT_LABELS.addToCart);
    for (const marker of ADD_MARKERS) expect(html).not.toContain(marker);
  });

  it("T2 пробелы в «Основной кнопке» считаются пустым полем", () => {
    const html = markupOnly(
      renderLive(theme, { ...base, buttons: { addToCart: { text: "   " } } }),
    );
    for (const marker of ADD_MARKERS) expect(html).not.toContain(marker);
  });

  it("T2 «Динамическая кнопка → Текст» печатается на кнопке", () => {
    const html = markupOnly(
      renderLive(theme, {
        ...base,
        buttons: { buyNow: { text: MARK.buyNow } },
        dynamicButton: "true",
      }),
    );
    expect(html).toContain(MARK.buyNow);
    expect(html).not.toContain(DEFAULT_LABELS.buyNow);
  });

  it("T2 пустая «Динамическая кнопка» = дефолт «Купить сейчас»", () => {
    const html = markupOnly(
      renderLive(theme, {
        ...base,
        buttons: { buyNow: { text: "" } },
        dynamicButton: "true",
      }),
    );
    expect(html).toContain(DEFAULT_LABELS.buyNow);
  });

  it("T3 «Поделиться → Текст» печатается у кнопки", () => {
    const html = markupOnly(
      renderLive(theme, { ...base, share: { text: MARK.share } }),
    );
    expect(html).toContain(MARK.share);
    expect(html).not.toContain(`>${DEFAULT_LABELS.share}<`);
  });

  it("T4 «Текст» выводится в секции", () => {
    const html = markupOnly(
      renderLive(theme, {
        ...base,
        text: { content: MARK.text, size: "medium" },
      }),
    );
    expect(html).toContain(MARK.text);
  });

  it("T4 «Размер текста» меняет кегль", () => {
    const small = renderLive(theme, {
      ...base,
      text: { content: MARK.text, size: "small" },
    });
    const large = renderLive(theme, {
      ...base,
      text: { content: MARK.text, size: "large" },
    });
    expect(small).toContain(MARK.text);
    expect(large).toContain(MARK.text);
    expect(small).not.toEqual(large);
    // theme-base печатает кегль переменной на корне секции, flux — классом
    // на самой бренд-строке; проверяем оба, не привязываясь к теме.
    const sizeOf = (html: string) => {
      const fromVar = /--product-text-size:(\d+)px/.exec(html)?.[1];
      if (fromVar) return fromVar;
      const brandTag =
        /<p[^>]*data-puck-subsection-field="text"[^>]*>/.exec(html)?.[0] ?? "";
      return /text-\[(\d+)px\] md:text-\[\d+px\]/.exec(brandTag)?.[1] ?? null;
    };
    expect(sizeOf(small)).not.toBeNull();
    expect(sizeOf(large)).not.toBeNull();
    expect(Number(sizeOf(small))).toBeLessThan(Number(sizeOf(large)));
  });

  it("САБОТАЖ: без ввода мерчанта маячков нет, стоят дефолты", () => {
    // Доказывает, что верхние проверки ловят ИМЕННО мерчантский ввод, а не
    // случайную подстроку, которая есть в разметке всегда.
    const html = markupOnly(renderLive(theme, { ...base }));
    for (const mark of Object.values(MARK)) expect(html).not.toContain(mark);
    expect(html).toContain(DEFAULT_LABELS.addToCart);
    expect(html).toContain(DEFAULT_LABELS.share);
  });
});

// ───── слой 3: «Цветовая схема» секции — та же болезнь, найдена попутно ─────

describe.each(THEMES)("«Товар» / %s: «Цветовая схема» секции", (theme) => {
  // Тот же корень, что у п.2/п.5 третьего круга (section-color-scheme-container):
  // `adaptLegacyProps` переводит "scheme-N" в ЧИСЛО N, а общий порт «Товара»
  // сверял `typeof colorScheme === 'string'` — класс не печатался НИКОГДА.
  it("класс печатается для строки «scheme-3»", () => {
    const html = renderLive(theme, { ...base, colorScheme: "scheme-3" });
    expect(html).toContain("color-scheme-3");
  });

  it("класс печатается для числа 3 (то, что отдаёт живая нормализация)", () => {
    const html = renderLive(theme, { ...base, colorScheme: 3 });
    expect(html).toContain("color-scheme-3");
  });

  it("САБОТАЖ: чужой схемы в разметке не появляется", () => {
    // Проверка не вырождена: класс печатается ИМЕННО выбранной схемы, а не
    // «какой-нибудь». Полного отсутствия класса требовать нельзя — порт flux
    // при пустом поле осознанно печатает свою дефолтную scheme-2.
    const { colorScheme: _drop, ...noScheme } = base;
    const html = renderLive(theme, noScheme);
    expect(html).not.toContain("color-scheme-3");
  });
});
