/**
 * extension-purchase — чистые функции формы покупки на странице товара:
 * точка расширения из карты, раскладка пунктов, сбор ответа, безопасная ссылка,
 * разбор ответа отправки и разметка (строкой, без DOM). Моков нет.
 * Поведение в браузере — extension-purchase.dom.test.ts.
 */
import {
  classifyResponse,
  collectSubmitInput,
  createSubmitId,
  findProductPoint,
  layoutRows,
  renderFormHtml,
  renderResultHtml,
  safeLink,
  uploadHint,
  type FormState,
} from "../runtime/extension-purchase";
import { MESSAGES_V2 } from "../runtime/forms-vendor/validate-v2";
import type { FormItem, FormV2 } from "../runtime/forms-vendor/types-v2";
import {
  VERSTAK_FORM,
  VERSTAK_FORM_VIEW,
} from "../stand/extension-purchase/stand-data";

const number = (id: string): FormItem => ({
  id,
  kind: "field",
  type: "number",
  title: id,
  visible: true,
  required: false,
});
const text = (id: string): FormItem => ({
  id,
  kind: "field",
  type: "text",
  title: id,
  visible: true,
  required: false,
});

const SUBMIT_ID = "5b0e2f0c-4f5e-4c53-8a43-6d1b7a1a9f10";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const emptyState = (): FormState => ({
  values: {},
  contacts: {},
  errors: { items: {} },
  notice: "",
  busy: false,
  submitId: SUBMIT_ID,
});

describe("findProductPoint: точка «товар» из карты витрины", () => {
  it("берёт первое расширение, у которого form и submit — строки", () => {
    const map = {
      orders: { orders: { list: "x" } },
      first: { product: { form: "formFn", submit: "submitFn" } },
      second: { product: { form: "other", submit: "other" } },
    };
    expect(findProductPoint(map)).toEqual({
      extensionId: "first",
      form: "formFn",
      submit: "submitFn",
    });
  });

  it("пропускает расширение без submit или с не-строкой", () => {
    const map = {
      a: { product: { form: "f" } },
      b: { product: { form: "f", submit: 5 } },
      c: { product: { form: "f2", submit: "s2" } },
    };
    expect(findProductPoint(map)?.extensionId).toBe("c");
  });

  it.each([
    null,
    undefined,
    5,
    "map",
    [],
    {},
    { a: null },
    { a: { product: null } },
  ])("нет точки (%p) → null", (map) => {
    expect(findProductPoint(map)).toBeNull();
  });
});

describe("layoutRows: раскладка пунктов", () => {
  it("два числовых поля подряд — в одной строке", () => {
    const rows = layoutRows([number("a"), number("b"), text("c")]);
    expect(rows.map((row) => row.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("третье числовое подряд остаётся одно, пара не переносится дальше", () => {
    const rows = layoutRows([number("a"), number("b"), number("c")]);
    expect(rows.map((row) => row.length)).toEqual([2, 1]);
  });

  it("числовое поле не в паре с текстовым", () => {
    const rows = layoutRows([number("a"), text("b"), number("c")]);
    expect(rows.map((row) => row.length)).toEqual([1, 1, 1]);
  });

  it("порядок пунктов сохраняется", () => {
    const rows = layoutRows(VERSTAK_FORM.items);
    expect(rows.flat().map((item) => item.id)).toEqual(
      VERSTAK_FORM.items.map((item) => item.id),
    );
  });
});

describe("collectSubmitInput: тело отправки", () => {
  const state = {
    values: { f40: "180", f41: "90", f42: "Дуб", f43: "Масло", f45: true },
    contacts: {
      name: " Игорь ",
      email: "igor@example.ru",
      phone: "",
      social: "@igor",
    },
    submitId: SUBMIT_ID,
  };

  it("значения по типам, контакты без пустых, согласие true, файлов нет, ключ повтора", () => {
    expect(collectSubmitInput("p1", VERSTAK_FORM, state)).toEqual({
      submitId: SUBMIT_ID,
      productId: "p1",
      values: { f40: 180, f41: 90, f42: "Дуб", f43: "Масло", f45: true },
      contacts: {
        name: "Игорь",
        email: "igor@example.ru",
        social: "@igor",
        consent: true,
      },
      files: {},
    });
  });

  it("скрытые пункты в ответ не попадают", () => {
    const form: FormV2 = {
      version: 2,
      items: VERSTAK_FORM.items.map((item) =>
        item.id === "f43" || item.id === "c-social"
          ? { ...item, visible: false }
          : item,
      ),
    };
    const input = collectSubmitInput("p1", form, state);
    expect(input.values).not.toHaveProperty("f43");
    expect(input.contacts).not.toHaveProperty("social");
  });

  it("пункт с невыполненным условием показа не попадает в ответ", () => {
    const form: FormV2 = {
      version: 2,
      items: [
        {
          id: "kind",
          kind: "field",
          type: "buttons",
          title: "k",
          visible: true,
          required: false,
          options: ["a", "b"],
        },
        {
          id: "extra",
          kind: "field",
          type: "text",
          title: "e",
          visible: true,
          required: false,
          condition: { field: "kind", equals: "b" },
        },
      ],
    };
    const input = collectSubmitInput("p1", form, {
      values: { kind: "a", extra: "x" },
      contacts: {},
      submitId: SUBMIT_ID,
    });
    expect(input.values).toEqual({ kind: "a" });
  });

  it("пустые необязательные: число и строка — null, флажок — false", () => {
    const input = collectSubmitInput("p1", VERSTAK_FORM, {
      values: {},
      contacts: {},
      submitId: SUBMIT_ID,
    });
    expect(input.values).toEqual({
      f40: null,
      f41: null,
      f42: null,
      f43: null,
      f45: false,
    });
  });
});

describe("createSubmitId: ключ повтора", () => {
  it("берёт crypto.randomUUID, если он есть", () => {
    expect(createSubmitId({ randomUUID: () => SUBMIT_ID })).toBe(SUBMIT_ID);
  });

  it("без randomUUID собирает uuid v4 из getRandomValues", () => {
    const fixed = (bytes: Uint8Array): Uint8Array => {
      bytes.fill(0xff);
      return bytes;
    };
    const id = createSubmitId({ getRandomValues: fixed });
    expect(id).toMatch(UUID_V4);
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("без crypto вовсе — всё равно uuid v4", () => {
    expect(createSubmitId(undefined)).toMatch(UUID_V4);
  });

  it("два вызова дают разные ключи", () => {
    expect(createSubmitId({})).not.toBe(createSubmitId({}));
  });
});

describe("safeLink: куда может вести кнопка экрана ответа", () => {
  it.each([
    "/account/orders",
    "/",
    "/catalog?x=1#top",
    "https://shop.example/page",
  ])("пускает %s", (url) => {
    expect(safeLink(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<b>",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "http://shop.example",
    "mailto:a@b.ru",
    "evil.example",
    "",
    "  /x",
    null,
    undefined,
    42,
  ])("не пускает %p", (url) => {
    expect(safeLink(url)).toBeNull();
  });
});

describe("classifyResponse: что значит ответ отправки", () => {
  const ok = { success: true, data: { title: "Готово", text: "Спасибо" } };

  it.each([200, 201, 204])("%i и success → успех с данными", (status) => {
    expect(classifyResponse(status, ok)).toEqual({
      kind: "success",
      result: ok.data,
    });
  });

  it("201 без title → сбой", () => {
    expect(classifyResponse(201, { success: true, data: {} })).toEqual({
      kind: "failed",
    });
  });

  it("200 без title → сбой, а не пустой экран успеха", () => {
    expect(classifyResponse(200, { success: true, data: {} }).kind).toBe(
      "failed",
    );
    expect(classifyResponse(200, { success: false })).toEqual({
      kind: "failed",
    });
  });

  it("422 refused → текст расширения и поля", () => {
    const body = {
      success: false,
      code: "refused",
      message: "Такой размер не делаем",
      issues: { reason: "size", fields: ["f40"] },
    };
    expect(classifyResponse(422, body)).toEqual({
      kind: "refused",
      message: "Такой размер не делаем",
      fields: ["f40"],
    });
  });

  it("422 без текста → сбой", () => {
    expect(
      classifyResponse(422, { success: false, code: "refused" }).kind,
    ).toBe("failed");
  });

  it("400 с полями → подсветка, текст общий", () => {
    const outcome = classifyResponse(400, {
      success: false,
      code: "invalid_input",
      message: "служебный текст",
      issues: { fields: ["f41", 5] },
    });
    expect(outcome).toEqual({ kind: "invalid", fields: ["f41"] });
  });

  it.each([401, 404, 500, 503])("%i и не-JSON → сбой", (status) => {
    expect(
      classifyResponse(status, { success: false, code: "x", message: "m" }),
    ).toEqual({
      kind: "failed",
    });
    expect(classifyResponse(status, null)).toEqual({ kind: "failed" });
  });
});

describe("uploadHint: подсказка у плитки файла", () => {
  it("фото: форматы решения Р11, лимит из FILE_LIMITS и число файлов", () => {
    expect(uploadHint("photo", 5)).toBe(
      "JPEG, PNG, HEIC, WebP или GIF до 20 МБ · до 5",
    );
  });

  it("число файлов по умолчанию — 1", () => {
    expect(uploadHint("video", undefined)).toBe("MP4 или MOV до 500 МБ · до 1");
    expect(uploadHint("file", undefined)).toBe(
      "PDF, ZIP, DOCX, XLSX или PPTX до 50 МБ · до 1",
    );
  });
});

describe("renderFormHtml: разметка формы", () => {
  const html = renderFormHtml(VERSTAK_FORM_VIEW, emptyState());

  it("у полей и контактов aria-label = название пункта, placeholder остаётся", () => {
    expect(html).toContain('aria-label="Длина, см"');
    expect(html).toContain('aria-label="Покрытие"');
    expect(html).toContain('aria-label="Имя"');
    expect(html).toContain('aria-label="Почта: name@mail.ru"');
    expect(html).toContain(
      'aria-label="Соцсеть или Telegram: @ник или ссылка на профиль"',
    );
    expect(html).toContain('placeholder="name@mail.ru"');
  });

  it("aria-label у textarea и экранируется", () => {
    const out = renderFormHtml(
      {
        ...VERSTAK_FORM_VIEW,
        form: {
          version: 2,
          items: [
            {
              id: "t",
              kind: "field",
              type: "textarea",
              title: 'Опиши "так"',
              visible: true,
              required: false,
            },
          ],
        },
      },
      emptyState(),
    );
    expect(out).toContain(
      '<textarea class="sf-in" data-xp-field="t" aria-label="Опиши &quot;так&quot;">',
    );
  });

  it("пары чисел — в одной строке .sf-num", () => {
    expect(html).toContain('<div class="sf-num">');
    expect(html.split('class="sf-num"')).toHaveLength(2);
  });

  it("у каждой подписи «обязательно» или «необязательно», у флажка подписи нет", () => {
    expect(html.match(/<small>обязательно<\/small>/g)).toHaveLength(6);
    expect(html.match(/<small>необязательно<\/small>/g)).toHaveLength(3);
  });

  it("список: первая опция «Выберите»; сегменты; подсказки контактов; согласие", () => {
    expect(html).toContain('<option value="">Выберите</option>');
    expect(html).toContain('data-xp-value="Ясень"');
    expect(html).toContain('placeholder="name@mail.ru"');
    expect(html).toContain('placeholder="+7"');
    expect(html).toContain('placeholder="@ник или ссылка на профиль"');
    expect(html).toContain(
      "Даю согласие на обработку персональных данных и файлов",
    );
  });

  it("плитка файла: подсказка с лимитами, accept из FILE_LIMITS", () => {
    expect(html).toContain("Выбрать фото");
    expect(html).toContain("JPEG, PNG, HEIC, WebP или GIF до 20 МБ · до 5");
    expect(html).toContain('accept="image/jpeg,image/png');
  });

  it("кнопка и подсказка под ней приходят от расширения", () => {
    expect(html).toContain(`>${VERSTAK_FORM_VIEW.submitLabel}</button>`);
    expect(html).toContain("Платить сейчас не нужно.");
  });

  it("тексты расширения экранируются", () => {
    const evil = '<img src=x onerror="boom()">';
    const view = {
      ...VERSTAK_FORM_VIEW,
      title: evil,
      submitLabel: evil,
      hint: evil,
      form: {
        version: 2 as const,
        items: [
          { ...number("n1"), title: evil },
          {
            id: "s",
            kind: "field" as const,
            type: "select" as const,
            title: "s",
            visible: true,
            required: false,
            options: [evil],
          },
        ],
      },
    };
    const out = renderFormHtml(view, { ...emptyState(), notice: evil });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("ошибки: текст под полем, рамка .bad, ошибка согласия, текст у кнопки", () => {
    const out = renderFormHtml(VERSTAK_FORM_VIEW, {
      ...emptyState(),
      errors: {
        items: { f40: MESSAGES_V2.textRequired, f41: "" },
        consent: MESSAGES_V2.consentRequired,
      },
      notice: "Не удалось отправить. Попробуйте ещё раз.",
    });
    expect(out).toContain(`<div class="err">${MESSAGES_V2.textRequired}</div>`);
    expect(out.match(/sf-in bad/g)).toHaveLength(2);
    expect(out).toContain(
      `<div class="err">${MESSAGES_V2.consentRequired}</div>`,
    );
    expect(out).toContain("Не удалось отправить. Попробуйте ещё раз.");
  });

  it("кнопка недоступна, пока идёт запрос", () => {
    expect(
      renderFormHtml(VERSTAK_FORM_VIEW, { ...emptyState(), busy: true }),
    ).toContain("data-xp-submit disabled");
  });
});

describe("renderResultHtml: экран ответа", () => {
  it("заголовок, текст, кнопки-ссылки: первая тёмная, остальные светлые", () => {
    const html = renderResultHtml({
      title: "Принято",
      text: "Ответ на почту",
      buttons: [
        { label: "Открыть", url: "/account/orders" },
        { label: "В каталог", url: "/catalog" },
      ],
    });
    expect(html).toContain("<b>Принято</b>");
    expect(html).toContain("Ответ на почту");
    expect(html).toContain(
      '<a class="sf-btn" href="/account/orders">Открыть</a>',
    );
    expect(html).toContain(
      '<a class="sf-btn light" href="/catalog">В каталог</a>',
    );
  });

  it("кнопки с небезопасной ссылкой не рисуются; больше трёх не бывает", () => {
    const html = renderResultHtml({
      title: "t",
      buttons: [
        { label: "Плохая", url: "javascript:alert(1)" },
        { label: "Раз", url: "/a" },
        { label: "Два", url: "/b" },
        { label: "Три", url: "/c" },
        { label: "Четыре", url: "/d" },
      ],
    });
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("Плохая");
    expect(html).toContain('<a class="sf-btn" href="/a">Раз</a>');
    expect(html).not.toContain("Четыре");
  });

  it("текст и подписи экранируются", () => {
    const html = renderResultHtml({
      title: "<script>x()</script>",
      text: "<b>x</b>",
      buttons: [{ label: "<i>", url: "/a" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<i>");
  });

  it("без text и buttons — только заголовок", () => {
    const html = renderResultHtml({ title: "Готово" });
    expect(html).toContain("<b>Готово</b>");
    expect(html).not.toContain("<a ");
  });
});
