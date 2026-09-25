import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * rose: ПУСТАЯ секция «Изображение» слушает настройки панели.
 *
 * Тестер 24.09: «Изображение по всем настройкам сломалась, не принимает
 * изменения». Свежедобавленный герой (без своих фото и текста) рисуется
 * отдельной веткой-заглушкой, и в ней Затемнение, Позиция, Выравнивание,
 * размеры заголовка и текста и вторая кнопка не были подключены — разметка
 * оставалась байт-в-байт той же.
 *
 * Сторожим: каждая настройка меняет разметку ПУСТОЙ секции, а без своего
 * значения заглушка выглядит так, как показывает панель (дефолты панели дают
 * ту же разметку, что их отсутствие).
 */

const КАТАЛОГ = { products: [], collections: [], publications: [] };
const ПУСТО = { id: "Hero-1", colorScheme: "scheme-1" };

function рендер(...варианты: Array<Record<string, unknown>>): string[] {
  const html = renderSections(
    "rose",
    варианты.map((props) => ({
      block: "Hero",
      props: { ...ПУСТО, ...props },
      catalog: КАТАЛОГ,
    })),
  ).map((r) => r?.html ?? "");
  for (const h of html) {
    // Все варианты — именно заглушка, а не заполненная ветка.
    expect(h).toContain("Покажи и расскажи о своем товаре в одном блоке");
  }
  return html;
}

/** Классы внешнего слоя заглушки (ставит блок по «Позиции»). */
function внешний(html: string): string {
  const m = html.match(/class="(absolute inset-0 z-10 flex w-full flex-col [^"]*)"/);
  return m?.[1] ?? "";
}

describe("rose: пустая секция «Изображение» принимает настройки панели", () => {
  const НАСТРОЙКИ: Array<[string, Array<Record<string, unknown>>]> = [
    ["Затемнение", [{ overlay: 0 }, { overlay: 60 }]],
    [
      "Позиция",
      [{ position: "top-right" }, { position: "center" }, { position: "bottom-left" }],
    ],
    ["Выравнивание", [{ alignment: "left" }, { alignment: "center" }, { alignment: "right" }]],
    [
      "Размер заголовка",
      [
        { heading: { size: "small" } },
        { heading: { size: "medium" } },
        { heading: { size: "large" } },
      ],
    ],
    [
      "Размер текста",
      [{ text: { size: "small" } }, { text: { size: "medium" } }, { text: { size: "large" } }],
    ],
    ["Кнопка дополнительная", [{}, { secondaryButton: { text: "Ещё" } }]],
  ];

  it.each(НАСТРОЙКИ)("%s: каждое значение даёт свою разметку", (_имя, значения) => {
    const html = рендер(...значения);
    expect(new Set(html).size).toBe(значения.length);
  });

  it("Позиция ставит блок по вертикали и горизонтали", () => {
    const [сверхуСправа, центр, снизуСлева] = рендер(
      { position: "top-right" },
      { position: "center" },
      { position: "bottom-left" },
    ).map(внешний);
    expect(сверхуСправа).toMatch(/\bjustify-start\b/);
    expect(сверхуСправа).toMatch(/\bitems-end\b/);
    expect(центр).toMatch(/\bjustify-center\b/);
    expect(центр).toMatch(/\bitems-center\b/);
    expect(снизуСлева).toMatch(/\bjustify-end\b/);
    expect(снизуСлева).toMatch(/\bitems-start\b/);
  });

  it("Выравнивание двигает текст и кнопки внутри блока", () => {
    const [справа] = рендер({ alignment: "right" });
    expect(справа).toMatch(/text-right/);
    expect(справа).not.toMatch(/text-center/);
    // Кнопочный ряд выровнен так же, как текст.
    expect(справа).toMatch(/class="flex w-full flex-col items-end justify-center"/);
  });

  it("Затемнение — чёрный слой нужной плотности только при значении > 0", () => {
    const [ноль, шестьдесят] = рендер({ overlay: 0 }, { overlay: 60 });
    expect(ноль).not.toMatch(/opacity:/);
    expect(шестьдесят).toMatch(/bg-black"[^>]*style="opacity:0\.6"/);
  });

  it("Вторая кнопка рисуется, когда задан её текст", () => {
    const [без, с] = рендер({}, { secondaryButton: { text: "Ещё" } });
    expect(без).not.toContain('data-puck-subsection-field="secondaryButton"');
    expect(с).toContain('data-puck-subsection-field="secondaryButton"');
    expect(с).toMatch(/>\s*Ещё\s*</);
  });

  it("Без своего значения — то, что показывает панель", () => {
    // Дефолты панели rose: Выравнивание по центру (theme.json), Затемнение 0,
    // Размер «Большой», Контейнер выкл.; размеры шрифтов — «Большой».
    // Скрытую позицию contentPosition панель с 25.09 не вписывает, но в
    // старых ревизиях лежит 'center' — заглушка с ним стоит там же.
    const [нет, панель, крупные, поЦентру, старая] = рендер(
      {},
      {
        alignment: "center",
        overlay: 0,
        size: "large",
        container: "false",
      },
      { heading: { size: "large" }, text: { size: "large" } },
      { position: "center" },
      { contentPosition: "center" },
    );
    expect(панель).toBe(нет);
    expect(крупные).toBe(нет);
    expect(поЦентру).toBe(нет);
    expect(старая).toBe(нет);
    const слой = внешний(нет);
    expect(слой).toMatch(/\bjustify-center\b/);
    expect(слой).toMatch(/\bitems-center\b/);
    expect(слой).toMatch(/\btext-center\b/);
  });
});
