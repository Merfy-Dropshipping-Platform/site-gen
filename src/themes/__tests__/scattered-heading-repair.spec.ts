import { adaptLegacyProps } from "../page-blocks";

/**
 * Заголовок, рассыпанный по буквам, собирается обратно на чтении.
 *
 * Панель конструктора до 22.09 писала «Размер заголовка» как
 * `{ ...currentProps.heading, size }`, а у «Сворачиваемого раздела» заголовок
 * хранится СТРОКОЙ. Спред строки превращал её в объект с числовыми ключами —
 * перехват сохранения на проде дал дословно:
 *
 *   "heading": {"0":"Ч","1":"а","2":"с", … ,"size":"large"}, "headingSize":"medium"
 *
 * Панель починена, но у магазинов, где настройку успели тронуть, испорченное
 * значение уже лежит в ревизии: объект без `text` уводит порт в свой дефолт, и
 * заголовок мерчанта на витрине потерян. Здесь сторожим починку на чтении.
 */

function рассыпать(
  текст: string,
  ещё: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...ещё };
  [...текст].forEach((ч, i) => {
    out[String(i)] = ч;
  });
  return out;
}

describe("рассыпанный по буквам заголовок", () => {
  it("собирается обратно в строку", () => {
    const props = adaptLegacyProps(
      { heading: рассыпать("Часто задаваемые вопросы") },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).toBe("Часто задаваемые вопросы");
  });

  it("размер рядом с буквами не теряется — уезжает в канон-ключ", () => {
    const props = adaptLegacyProps(
      { heading: рассыпать("Вопросы", { size: "large" }) },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).toBe("Вопросы");
    expect(props.headingSize).toBe("large");
  });

  it("явно заданный канон-ключ сильнее размера из мусора", () => {
    const props = adaptLegacyProps(
      {
        heading: рассыпать("Вопросы", { size: "large" }),
        headingSize: "small",
      },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.headingSize).toBe("small");
  });

  it("нормальный конверт не трогаем", () => {
    const props = adaptLegacyProps(
      { heading: { text: "Заголовок", size: "medium" } },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).toBe("Заголовок");
    expect(props.headingSize).toBe("medium");
  });

  it("обычная строка не трогается", () => {
    const props = adaptLegacyProps(
      { heading: "Заголовок" },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).toBe("Заголовок");
  });

  it("объект с дырявой нумерацией НЕ считается рассыпанной строкой", () => {
    const дыра = { "0": "а", "2": "б" };
    const props = adaptLegacyProps(
      { heading: дыра },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).not.toBe("аб");
  });

  it("одиночный символ не считается рассыпанной строкой", () => {
    const props = adaptLegacyProps(
      { heading: { "0": "а" } },
      null,
      "CollapsibleSection",
    ) as Record<string, unknown>;
    expect(props.heading).not.toBe("а");
  });
});
