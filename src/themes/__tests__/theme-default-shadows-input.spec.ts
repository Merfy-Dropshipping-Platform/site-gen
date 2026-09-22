import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * Дефолт темы не вправе глушить ввод мерчанта.
 *
 * Баг тестера 22.09, пункт 8 («Текст» в «Подписке на рассылку»). Панель пишет
 * этот текст в `description` — перехват сохранения на проде дал дословно
 * `"description":"…"`, ключа `text` в пропах нет вовсе. А `theme.json` bloom нёс
 * `blockDefaults.Newsletter.text = { content: "Узнавайте первыми…" }`, и порты
 * читают текст цепочкой `text → description`: дефолт темы стоял ПЕРВЫМ и
 * побеждал всегда. Литерал при этом дублировал собственный фолбэк порта, то
 * есть не давал ничего, кроме этой поломки.
 *
 * Тестер сообщил про vanilla, а замер показал bloom — поэтому проверка гоняет
 * ВСЕ пять тем, а не ту, на которую пожаловались.
 */

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const КАТАЛОГ = { products: [], collections: [], publications: [] };

/** Пропы ровно той формы, какую пишет панель конструктора (перехват 22.09). */
const ОТ_ПАНЕЛИ = {
  id: "Newsletter-1",
  heading: "Подпишись на новости",
  description: "ВВОД_МЕРЧАНТА",
  placeholder: "Email",
  buttonText: "Подписаться",
  formLayout: "stacked",
  agreement: "false",
  hideTitle: "false",
  colorScheme: "scheme-1",
};

describe("«Текст» подписки: ввод мерчанта сильнее дефолта темы", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: введённый текст выводится на витрине`, () => {
      const [строка] = renderSections(тема, [
        { block: "Newsletter", props: ОТ_ПАНЕЛИ, catalog: КАТАЛОГ },
      ]);
      expect(строка?.html ?? "").toContain("ВВОД_МЕРЧАНТА");
    });

    it(`${тема}: пустая секция по-прежнему показывает свой текст`, () => {
      const [строка] = renderSections(тема, [
        {
          block: "Newsletter",
          props: { id: "Newsletter-1", colorScheme: "scheme-1" },
          catalog: КАТАЛОГ,
        },
      ]);
      // Плейсхолдер на месте — иначе проверка выше сторожила бы пустоту.
      expect((строка?.html ?? "").length).toBeGreaterThan(200);
    });
  }

  it("ни одна тема не держит в blockDefaults текст подписки", () => {
    // Класс, а не один ключ: любой такой дефолт снова перекроет ввод.
    const держат: string[] = [];
    for (const тема of ТЕМЫ) {
      const манифест = require(
        `../../../packages/theme-${тема}/theme.json`,
      ) as {
        blockDefaults?: Record<string, Record<string, unknown>>;
      };
      const nl = манифест.blockDefaults?.Newsletter ?? {};
      const текст = nl.text as { content?: unknown } | undefined;
      if (
        текст &&
        typeof текст === "object" &&
        typeof текст.content === "string"
      ) {
        держат.push(тема);
      }
      if (typeof nl.description === "string")
        держат.push(`${тема}/description`);
    }
    expect(держат).toEqual([]);
  });
});
