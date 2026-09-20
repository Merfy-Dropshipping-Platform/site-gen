import { adaptLegacyProps } from "../page-blocks";

/**
 * Перепроверка тестера (20.09, Vanilla): «„Основной текст“ ▸ „Заголовок“ →
 * „Размер заголовка“: в панели „Большой“, на витрине text-[20px]». То же для
 * «Изображение с текстом» и «Подписка на рассылку».
 *
 * Замер витрины подтвердил: все h2 секций — 20px, то есть тема каждый раз
 * попадает в ветку «иначе». А в стартовом контенте vanilla у «Основного текста»
 * стоит `size: 'small'`, у «Изображения с текстом» — `'large'`: значит размер
 * терялся ДО темы.
 *
 * Причина — в нормализаторе: `heading` приходит конвертом `{text, size}`, схема
 * блока ждёт строку, и конверт плющился СРАЗУ, вместе с размером. Соседние
 * блоки (ContactForm, Collections, Gallery) спасают размер в top-level
 * `headingSize` перед сплющиванием — MainText этого не делал.
 */
describe("MainText: размер заголовка переживает нормализацию", () => {
  const adapt = (props: Record<string, unknown>) =>
    adaptLegacyProps(props, null, "MainText") as Record<string, unknown>;

  it("размер из конверта заголовка попадает в headingSize", () => {
    const out = adapt({ heading: { text: "Заголовок", size: "large" } });
    expect(out.headingSize).toBe("large");
    expect(out.heading).toBe("Заголовок");
  });

  it("размер из конверта текста попадает в textSize", () => {
    const out = adapt({ text: { content: "Текст", size: "small" } });
    expect(out.textSize).toBe("small");
    expect(out.text).toBe("Текст");
  });

  it("явный top-level размер сильнее конверта", () => {
    const out = adapt({ heading: { text: "Заголовок", size: "small" }, headingSize: "large" });
    expect(out.headingSize).toBe("large");
  });

  it("строковый заголовок по-прежнему работает", () => {
    const out = adapt({ heading: "Просто строка" });
    expect(out.heading).toBe("Просто строка");
  });
});

/**
 * Та же потеря была у ВСЕХ блоков без собственного нормализатора: общий
 * `coerceGenericLegacyProps` разворачивал конверт `{text|content, size}` в
 * голую строку. Отсюда пункты перепроверки про «Сворачиваемый раздел»,
 * «Подписку на рассылку» и «Мультиколонны ▸ Колонна».
 */
describe("размер переживает нормализацию у блоков без своего коерсера", () => {
  const BLOCKS = ["Newsletter", "CollapsibleSection", "MultiColumns", "MultiRows", "Video"];

  it.each(BLOCKS)("%s: размер заголовка", (block) => {
    const out = adaptLegacyProps(
      { heading: { text: "Заголовок", size: "large" } },
      null,
      block,
    ) as Record<string, unknown>;
    expect(out.headingSize).toBe("large");
    expect(out.heading).toBe("Заголовок");
  });

  it.each(BLOCKS)("%s: размер текста", (block) => {
    const out = adaptLegacyProps(
      { text: { content: "Текст", size: "small" } },
      null,
      block,
    ) as Record<string, unknown>;
    expect(out.textSize).toBe("small");
    expect(out.text).toBe("Текст");
  });

  it("ImageWithText тоже сохраняет оба размера", () => {
    const out = adaptLegacyProps(
      { heading: { text: "З", size: "large" }, text: { content: "Т", size: "small" } },
      null,
      "ImageWithText",
    ) as Record<string, unknown>;
    expect(out.headingSize).toBe("large");
    expect(out.textSize).toBe("small");
  });
});
