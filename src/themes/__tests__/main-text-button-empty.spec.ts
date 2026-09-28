import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * «Основной текст»: кнопка есть, только когда в панели заполнен её текст.
 *
 * Тестировщик: «Баг в секции основной текст при пустом инпуте в кнопке он
 * отображает кнопку, не отображать при пустом».
 *
 * Пустой инпут давал кнопку тремя путями:
 *   • заглушка «Кнопка» пустого состояния (макет 1:19335): rose рисовал её при
 *     любом пустом тексте, flux — пока поля «Кнопка» в секции нет, остальные — в
 *     пустой секции. В панели заглушку не видно (правило 3 контракта секций);
 *   • старое скрытое `cta` стартового наполнения («К покупкам», «СМОТРЕТЬ
 *     КАТАЛОГ»): порт брал его при пустом инпуте, даже если мерчант его очистил;
 *   • заготовки страниц тем писали кнопку в `cta`, а не в поле панели.
 *
 * Правило одно (packages/theme-base/runtime/main-text-button.ts): текст из поля
 * «Кнопка → Текст», пусто — кнопки нет. Старое `cta` — только пока поля
 * «Кнопка» в секции нет вовсе; чтение ревизии переносит его в поле панели
 * (revision-migrations `backfillMainTextLegacyButton`).
 *
 * Рисуем живой цепочкой (`live: true`: adaptLegacyProps → blockDefaults темы →
 * порт), как витрина и превью.
 */

const THEMES = ["rose", "vanilla", "flux", "bloom", "satin"] as const;

const FILLED = {
  heading: { text: "Заголовок мерчанта" },
  text: { content: "Текст мерчанта" },
};
const LEGACY_CTA = { text: "К покупкам", href: "/catalog" };

/** [случай, пропсы секции, ожидаемый текст кнопки или null — кнопки нет]. */
const CASES: [string, Record<string, unknown>, string | null][] = [
  ["поле «Кнопка» не трогали", FILLED, null],
  ["текст кнопки очищен", { ...FILLED, button: { text: "", link: { href: "/catalog" } } }, null],
  ["в тексте кнопки одни пробелы", { ...FILLED, button: { text: "   " } }, null],
  ["секция пустая целиком", {}, null],
  ["кнопку очистили, а старое cta осталось", { ...FILLED, button: { text: "" }, cta: LEGACY_CTA }, null],
  ["текст кнопки задан", { ...FILLED, button: { text: "Купить", link: { href: "/catalog" } } }, "Купить"],
  ["старое cta, поля «Кнопка» ещё нет", { ...FILLED, cta: LEGACY_CTA }, "К покупкам"],
];

/** Текст ссылки-кнопки секции или null, если кнопки в разметке нет. */
const buttonText = (html: string): string | null => {
  const m = /<a\b[^>]*data-puck-subsection-field="button"[^>]*>([\s\S]*?)<\/a>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
};

describe.each(THEMES)("«Основной текст» %s: кнопка только с текстом из панели", (theme) => {
  const rendered = renderSections(
    theme,
    CASES.map(([, props]) => ({ block: "MainText", props: { id: "MainText-1", ...props }, live: true })),
  ).map((r) => {
    if (r.error) throw new Error(`${theme}: ${r.error}`);
    return r.html ?? "";
  });

  it.each(CASES.map((c, i) => [c[0], c[2], i] as const))("%s", (_name, expected, i) => {
    expect(buttonText(rendered[i])).toBe(expected);
  });
});

describe("саботаж: детектор кнопки", () => {
  it("находит кнопку и её текст", () => {
    const html =
      '<div><a href="/catalog" class="inline-flex" data-puck-subsection-field="button">\n  Кнопка\n</a></div>';
    expect(buttonText(html)).toBe("Кнопка");
  });

  it("без кнопки — null", () => {
    expect(buttonText('<div><h2 data-puck-subsection-field="heading">Заголовок</h2></div>')).toBeNull();
  });
});
