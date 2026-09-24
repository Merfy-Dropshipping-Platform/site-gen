import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * satin, два замечания тестера 24.09.
 *
 * 1. «Изображение — не работают Позиция и Выравнивание». Пустой первый экран
 *    (заглушка до своих фото и текста) шёл отдельной веткой с жёстким центром,
 *    а панель по умолчанию показывает «По центру слева». Теперь заглушка слушает
 *    обе настройки, как заполненный экран, и как bloom/vanilla.
 * 2. «После выбора темы сбрасываются Отступы у Header». Засев satin кладёт шапке
 *    0/0, а любой заданный отступ снимал минимальную высоту ряда — шапка
 *    сжималась с 65 до 55. Теперь min-h-16 остаётся всегда, отступы — сверху.
 */
const КАТАЛОГ = { products: [], collections: [], publications: [] };
const hero = (props: Record<string, unknown>) =>
  renderSections("satin", [{ block: "Hero", props: { id: "Hero-1", ...props }, catalog: КАТАЛОГ }])[0].html ?? "";
const header = (props: Record<string, unknown>) =>
  renderSections("satin", [{ block: "Header", props: { id: "Header-1", siteTitle: "Satin", ...props }, catalog: КАТАЛОГ }])[0].html ?? "";

describe("satin: пустой первый экран слушает «Позицию» и «Выравнивание»", () => {
  it("по умолчанию — как показывает панель: слева, по центру по высоте", () => {
    const html = hero({});
    expect(html).toContain("justify-center items-start");
    expect(html).not.toMatch(/flex-col items-center justify-center gap-6 px-4 text-center/);
  });

  it("«Сверху справа» — сверху и справа", () => {
    expect(hero({ position: "top-right" })).toContain("justify-start md:py-12 items-end");
  });

  it("«По центру» — по центру", () => {
    expect(hero({ position: "center" })).toContain("justify-center items-center");
  });

  it("«Выравнивание» двигает текст и кнопку вместе", () => {
    const html = hero({ alignment: "right" });
    expect(html).toContain("flex w-full max-w-[540px] flex-col items-end gap-6 md:max-w-[640px]");
    expect(html).toContain("text-right");
  });

  it("размер заголовка и текста работают и на пустой секции", () => {
    expect(hero({ heading: { size: "small" } })).toContain("text-[18px] md:text-[22px]");
    expect(hero({ text: { size: "small" } })).toContain("font-manrope text-[11px]");
    expect(hero({})).toContain("text-[26px] md:text-[32px]");
  });

  it("вторая кнопка рисуется и на пустой секции", () => {
    const html = hero({ secondaryButton: { text: "Ещё" } });
    expect(html).toContain('data-puck-subsection-field="secondaryButton"');
    expect(html).toMatch(/>\s*Ещё\s*<\/a>/);
  });

  it("разные значения — разная разметка", () => {
    const set = new Set([{}, { position: "top-right" }, { position: "center" }, { alignment: "right" }].map((x) => hero(x)));
    expect(set.size).toBe(4);
  });
});

describe("satin: шапка с отступами не сжимается", () => {
  it.each([{ top: 0, bottom: 0 }, { top: 12, bottom: 12 }])("отступы %o — минимальная высота ряда на месте", (padding) => {
    const html = header({ padding });
    expect(html).toContain("min-h-16");
    expect(html).toContain(`padding-top:${padding.top}px;padding-bottom:${padding.bottom}px;`);
  });
});
