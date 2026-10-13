/**
 * @jest-environment jsdom
 *
 * Файлы в форме покупки (задача 5.2): выбор файла запускает загрузку в три
 * шага (шлюз → хранилище → шлюз), плитка показывает выбранное, «Убрать файл»
 * убирает, отправка ждёт загрузки и несёт id готовых файлов; повтор отправки
 * не грузит файлы заново. Плюс две мелочи 5.1: форма прячет переключатель
 * количества и прокручивает экран ответа к началу формы.
 */
import {
  mountExtensionPurchase,
  type ProductFormView,
} from "../runtime/extension-purchase";
import { FILE_TEXTS } from "../runtime/extension-purchase-files";
import { MESSAGES_V2 } from "../runtime/forms-vendor/validate-v2";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_SENT,
} from "../stand/extension-purchase/stand-data";

interface FetchInitSeen {
  method?: string;
  credentials?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

type Reply = { status?: number; body: unknown } | "network-error";
type Route = Reply | ((url: string) => Reply | Promise<Reply>);
type RouteName = "map" | "form" | "submit" | "start" | "storage" | "complete";
type Routes = Partial<Record<RouteName, Route>>;

const API = "https://gateway.test/api";
const STORAGE = "https://storage.test/ext-files";
const TOKEN_KEY = "merfy_customer_token";
const FILES_FAILURE = "Не все файлы загрузились — проверьте отмеченные поля.";

const FILES_VIEW: ProductFormView = {
  title: "Форма",
  submitLabel: "Отправить",
  form: {
    version: 2,
    items: [
      {
        id: "ph",
        kind: "field",
        type: "photo",
        title: "Фото",
        visible: true,
        required: true,
        maxFiles: 3,
      },
      {
        id: "vd",
        kind: "field",
        type: "video",
        title: "Видео",
        visible: true,
        required: false,
      },
      {
        id: "dc",
        kind: "field",
        type: "file",
        title: "Документ",
        visible: true,
        required: false,
        maxFiles: 2,
      },
      {
        id: "nt",
        kind: "field",
        type: "text",
        title: "Комментарий",
        visible: true,
        required: false,
      },
      {
        id: "c-email",
        kind: "contact",
        key: "email",
        title: "Почта",
        visible: true,
        required: true,
      },
    ],
  },
};

const MAP_REPLY: Reply = {
  body: {
    [STAND_EXTENSION_ID]: {
      product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN },
    },
  },
};

let started = 0;

/** Шаг 1: новый fileId на каждый вызов, форма хранилища с двумя полями. */
function startReply(): Reply {
  started += 1;
  return {
    body: {
      success: true,
      data: {
        fileId: `file-${started}`,
        upload: { url: STORAGE, fields: { key: `k-${started}`, policy: "p" } },
        expiresAt: "2026-10-13T20:00:00.000Z",
      },
    },
  };
}

/** Шаг 3: тот же fileId из адреса, файл готов. */
function completeReply(url: string): Reply {
  const fileId = /\/files\/([^/]+)\/complete/.exec(url)?.[1] ?? "";
  return { body: { success: true, data: { fileId, status: "ready" } } };
}

const DEFAULT_ROUTES: Routes = {
  map: MAP_REPLY,
  form: { body: { success: true, data: FILES_VIEW } },
  submit: { body: { success: true, data: VERSTAK_SENT } },
  start: startReply,
  storage: { status: 204, body: null },
  complete: completeReply,
};

const ROUTE_TESTS: Array<[RouteName, (url: string) => boolean]> = [
  ["map", (url) => url.includes("/store/extensions/storefront")],
  ["form", (url) => url.includes(`/fn/${STAND_FORM_FN}`)],
  ["submit", (url) => url.includes(`/fn/${STAND_SUBMIT_FN}`)],
  ["complete", (url) => url.includes("/complete?")],
  ["start", (url) => url.includes("/files?")],
  ["storage", (url) => url.startsWith(STORAGE)],
];

const routeOf = (url: string): RouteName =>
  ROUTE_TESTS.find(([, test]) => test(url))?.[0] ?? "submit";

function mockFetch(routes: Routes) {
  const all = { ...DEFAULT_ROUTES, ...routes };
  const fn = jest.fn<Promise<unknown>, [string, FetchInitSeen?]>(
    async (url) => {
      const route = all[routeOf(url)] ?? { status: 404, body: null };
      const value = typeof route === "function" ? await route(url) : route;
      if (value === "network-error") throw new TypeError("Failed to fetch");
      // Шлюз отвечает на POST 201, на карту — 200; хранилище — 204.
      const status = value.status ?? (routeOf(url) === "map" ? 200 : 201);
      return {
        ok: status < 400,
        status,
        json: () => Promise.resolve(value.body),
      };
    },
  );
  (window as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

type FetchMock = ReturnType<typeof mockFetch>;

const callsTo = (fn: FetchMock, name: RouteName) =>
  fn.mock.calls.filter(([url]) => routeOf(url) === name);

const bodyOf = (call: [string, FetchInitSeen?]): unknown =>
  JSON.parse(String(call[1]?.body ?? "null"));

/** Ждёт, пока отработают цепочки промисов загрузки (у каждого шага свои await). */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function page(withQuantity = false): HTMLElement {
  const root = document.createElement("section");
  const quantity = withQuantity
    ? '<div data-product-quantity="true"><button type="button">−</button>1<button type="button">+</button></div>'
    : "";
  root.innerHTML =
    quantity +
    '<div data-product-actions><button type="button">В корзину</button></div>' +
    "<span data-extension-purchase-note hidden></span>" +
    '<div class="xp" data-extension-purchase hidden></div>';
  document.body.appendChild(root);
  return root;
}

async function mounted(routes: Routes = {}, root = page()) {
  const fn = mockFetch(routes);
  await mountExtensionPurchase(root, {
    productId: STAND_PRODUCT_ID,
    storeId: STAND_STORE_ID,
    apiBase: API,
  });
  return { fn, root };
}

const box = (root: HTMLElement) =>
  root.querySelector("[data-extension-purchase]") as HTMLElement;
const field = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-xp-upload="${id}"]`) as HTMLElement;
const removeButtons = (root: HTMLElement, id: string) =>
  Array.from(field(root, id).querySelectorAll("[data-xp-remove]"));
const submitButton = (root: HTMLElement) =>
  root.querySelector("[data-xp-submit]") as HTMLButtonElement;

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Как выбор в окне файлов: у input появляются files, затем change. */
function choose(root: HTMLElement, id: string, files: File[]): void {
  const input = root.querySelector(
    `[data-xp-file="${id}"]`,
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fire(input, "change");
}

const png = (name = "room.png") =>
  new File(["png-bytes"], name, { type: "image/png" });

function fillContacts(root: HTMLElement): void {
  const email = root.querySelector(
    '[data-xp-contact="email"]',
  ) as HTMLInputElement;
  email.value = "igor@example.ru";
  fire(email, "input");
  (root.querySelector("[data-xp-consent]") as HTMLElement).click();
}

/** Открытая заслонка: ответ маршрута ждёт release(). */
function gate(reply: Reply) {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { route: () => opened.then(() => reply), release: () => release() };
}

const createObjectURL = jest.fn((file: File) => `blob:${file.name}`);
const revokeObjectURL = jest.fn();
const scrollIntoView = jest.fn();

beforeEach(() => {
  started = 0;
  document.body.innerHTML = "";
  localStorage.clear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  scrollIntoView.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
});

describe("загрузка в три шага", () => {
  it("выбор фото: шлюз → хранилище → шлюз; токен только к шлюзу", async () => {
    localStorage.setItem(TOKEN_KEY, "tok-5");
    const { fn, root } = await mounted();
    choose(root, "ph", [png()]);
    await settle();
    const steps = fn.mock.calls
      .map(([url]) => routeOf(url))
      .filter((name) => ["start", "storage", "complete"].includes(name));
    expect(steps).toEqual(["start", "storage", "complete"]);

    const [startUrl, startInit] = callsTo(fn, "start")[0];
    expect(startUrl).toBe(
      `${API}/store/extensions/${STAND_EXTENSION_ID}/files?store_id=${STAND_STORE_ID}`,
    );
    expect(startInit?.credentials).toBe("include");
    expect(startInit?.headers?.Authorization).toBe("Bearer tok-5");
    expect(bodyOf(callsTo(fn, "start")[0])).toEqual({
      kind: "photo",
      name: "room.png",
      size: 9,
      mime: "image/png",
    });

    const [storageUrl, storageInit] = callsTo(fn, "storage")[0];
    expect(storageUrl).toBe(STORAGE);
    expect(storageInit?.method).toBe("POST");
    expect(storageInit?.credentials).toBe("omit");
    expect(storageInit?.headers).toBeUndefined();
    const form = storageInit?.body as FormData;
    expect(Array.from(form.keys())).toEqual(["key", "policy", "file"]);
    expect(form.get("key")).toBe("k-1");
    expect((form.get("file") as File).name).toBe("room.png");

    expect(callsTo(fn, "complete")[0][0]).toBe(
      `${API}/store/extensions/${STAND_EXTENSION_ID}/files/file-1/complete?store_id=${STAND_STORE_ID}`,
    );
  });

  it("готовое фото: превью, «Добавить ещё», «выбрано 1», «Убрать файл»", async () => {
    const { root } = await mounted();
    choose(root, "ph", [png()]);
    await settle();
    const upload = field(root, "ph");
    expect(upload.querySelector("img")?.getAttribute("src")).toBe(
      "blob:room.png",
    );
    expect(upload.querySelector(".sf-up b")?.textContent).toBe("Добавить ещё");
    expect(upload.querySelector(".sf-up small")?.textContent).toContain(
      "· до 3 · выбрано 1",
    );
    expect(removeButtons(root, "ph")[0].getAttribute("aria-label")).toBe(
      "Убрать файл",
    );
    expect(upload.textContent).not.toContain("загружается");
  });

  it("пока файл грузится — пометка «загружается»", async () => {
    const storage = gate({ status: 204, body: null });
    const { root } = await mounted({ storage: storage.route });
    choose(root, "ph", [png()]);
    await settle();
    expect(field(root, "ph").querySelector(".sf-thumb.loading")).not.toBeNull();
    expect(field(root, "ph").textContent).toContain("загружается");
    storage.release();
    await settle();
    expect(field(root, "ph").querySelector(".sf-thumb.loading")).toBeNull();
  });

  it("HEIC без типа от браузера: шлюзу — image/heic, плитка без превью", async () => {
    const { fn, root } = await mounted();
    choose(root, "ph", [new File(["heic"], "IMG_0042.HEIC", { type: "" })]);
    await settle();
    expect(bodyOf(callsTo(fn, "start")[0])).toMatchObject({
      mime: "image/heic",
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(field(root, "ph").querySelector("img")).toBeNull();
    expect(field(root, "ph").querySelector(".sf-thumb")?.textContent).toContain(
      "HEIC",
    );
  });

  it("видео — одним запросом в хранилище, строкой «▶ имя» и «убрать»", async () => {
    const { fn, root } = await mounted();
    choose(root, "vd", [new File(["mp4"], "clip.mov", { type: "" })]);
    await settle();
    expect(callsTo(fn, "storage")).toHaveLength(1);
    expect(bodyOf(callsTo(fn, "start")[0])).toMatchObject({
      kind: "video",
      mime: "video/quicktime",
    });
    const row = field(root, "vd").querySelector(".sf-fl") as HTMLElement;
    expect(row.textContent).toBe("▶ clip.movубрать");
    expect(field(root, "vd").querySelector("[data-xp-file]")).toBeNull();
  });
});

describe("файл не берётся", () => {
  it("неподходящий формат — без запросов, причина у пункта", async () => {
    const { fn, root } = await mounted();
    choose(root, "ph", [
      new File(["pdf"], "plan.pdf", { type: "application/pdf" }),
    ]);
    await settle();
    expect(callsTo(fn, "start")).toHaveLength(0);
    expect(field(root, "ph").querySelector(".err")?.textContent).toBe(
      "«plan.pdf»: такой формат не подходит",
    );
  });

  it("сверх maxFiles — лишние не берутся, плитка выбора пропадает", async () => {
    const { fn, root } = await mounted();
    choose(root, "ph", [
      png("1.png"),
      png("2.png"),
      png("3.png"),
      png("4.png"),
    ]);
    await settle();
    expect(callsTo(fn, "start")).toHaveLength(3);
    expect(removeButtons(root, "ph")).toHaveLength(3);
    expect(field(root, "ph").querySelector("[data-xp-file]")).toBeNull();
    expect(field(root, "ph").querySelector(".err")?.textContent).toBe(
      "Не больше 3 фото",
    );
  });

  it("ядро отклонило на шаге 3 — файл убран, причина у пункта", async () => {
    const { root } = await mounted({
      complete: (url) => {
        const fileId = /\/files\/([^/]+)\/complete/.exec(url)?.[1];
        return {
          body: {
            success: true,
            data: { fileId, status: "rejected", reason: "wrong_type" },
          },
        };
      },
    });
    choose(root, "ph", [png("fake.png")]);
    await settle();
    expect(removeButtons(root, "ph")).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake.png");
    expect(field(root, "ph").querySelector(".err")?.textContent).toBe(
      "«fake.png»: такой формат не подходит",
    );
  });

  it("шлюз отказал на шаге 1 (too_large) — файл убран, причина у пункта", async () => {
    const { fn, root } = await mounted({
      start: {
        status: 400,
        body: { success: false, code: "too_large", message: "m" },
      },
    });
    choose(root, "dc", [new File(["pdf"], "plan.pdf", { type: "" })]);
    await settle();
    expect(callsTo(fn, "storage")).toHaveLength(0);
    expect(field(root, "dc").querySelector(".sf-fl")).toBeNull();
    expect(field(root, "dc").querySelector(".err")?.textContent).toBe(
      "«plan.pdf»: больше 50 МБ",
    );
  });
});

describe("«Убрать файл»", () => {
  it("убирает файл и его превью, плитка снова «Выбрать фото»", async () => {
    const { root } = await mounted();
    choose(root, "ph", [png()]);
    await settle();
    (removeButtons(root, "ph")[0] as HTMLElement).click();
    expect(removeButtons(root, "ph")).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:room.png");
    expect(field(root, "ph").querySelector(".sf-up b")?.textContent).toBe(
      "Выбрать фото",
    );
  });

  it("файл убрали, пока он грузился, — итог загрузки его не возвращает", async () => {
    const storage = gate({ status: 204, body: null });
    const { root } = await mounted({ storage: storage.route });
    choose(root, "ph", [png()]);
    await settle();
    (removeButtons(root, "ph")[0] as HTMLElement).click();
    storage.release();
    await settle();
    expect(removeButtons(root, "ph")).toHaveLength(0);
  });
});

describe("отправка с файлами", () => {
  it("обязательный файловый пункт без файлов — текст пакета форм, запроса нет", async () => {
    const { fn, root } = await mounted();
    fillContacts(root);
    submitButton(root).click();
    await settle();
    expect(callsTo(fn, "submit")).toHaveLength(0);
    expect(field(root, "ph").querySelector(".err")?.textContent).toBe(
      MESSAGES_V2.fileRequired,
    );
  });

  it("в теле — id готовых файлов по пунктам", async () => {
    const { fn, root } = await mounted();
    choose(root, "ph", [png("1.png"), png("2.png")]);
    choose(root, "dc", [new File(["pdf"], "plan.pdf", { type: "" })]);
    fillContacts(root);
    await settle();
    submitButton(root).click();
    await settle();
    expect(bodyOf(callsTo(fn, "submit")[0])).toMatchObject({
      files: { ph: ["file-1", "file-2"], dc: ["file-3"] },
    });
  });

  it("отправка ждёт идущую загрузку и уходит с её id", async () => {
    const storage = gate({ status: 204, body: null });
    const { fn, root } = await mounted({ storage: storage.route });
    choose(root, "ph", [png()]);
    fillContacts(root);
    submitButton(root).click();
    await settle();
    expect(callsTo(fn, "submit")).toHaveLength(0);
    expect(submitButton(root).disabled).toBe(true);
    storage.release();
    await settle();
    expect(bodyOf(callsTo(fn, "submit")[0])).toMatchObject({
      files: { ph: ["file-1"] },
    });
  });

  it("неудачная загрузка повторяется при отправке один раз; удалась — форма уходит", async () => {
    let storageCalls = 0;
    const { fn, root } = await mounted({
      storage: () => {
        storageCalls += 1;
        return storageCalls === 1
          ? "network-error"
          : { status: 204, body: null };
      },
    });
    choose(root, "ph", [png()]);
    fillContacts(root);
    await settle();
    expect(field(root, "ph").textContent).toContain("не загрузился");
    submitButton(root).click();
    await settle();
    expect(callsTo(fn, "start")).toHaveLength(2);
    expect(bodyOf(callsTo(fn, "submit")[0])).toMatchObject({
      files: { ph: ["file-2"] },
    });
  });

  it("загрузка снова не удалась — формы нет, у пункта текст, у кнопки общий", async () => {
    const { fn, root } = await mounted({ storage: "network-error" });
    choose(root, "ph", [png()]);
    fillContacts(root);
    await settle();
    submitButton(root).click();
    await settle();
    expect(callsTo(fn, "submit")).toHaveLength(0);
    expect(field(root, "ph").querySelector(".err")?.textContent).toBe(
      FILE_TEXTS.notUploaded,
    );
    expect(box(root).textContent).toContain(FILES_FAILURE);
    expect(submitButton(root).disabled).toBe(false);
  });

  it("повтор отправки после сбоя не грузит файлы заново: те же id и тот же ключ", async () => {
    let submits = 0;
    const { fn, root } = await mounted({
      submit: () => {
        submits += 1;
        return submits === 1
          ? { status: 503, body: null }
          : { body: { success: true, data: VERSTAK_SENT } };
      },
    });
    choose(root, "ph", [png("1.png"), png("2.png")]);
    fillContacts(root);
    await settle();
    submitButton(root).click();
    await settle();
    submitButton(root).click();
    await settle();
    const [first, second] = callsTo(fn, "submit").map(bodyOf);
    expect(callsTo(fn, "start")).toHaveLength(2);
    expect(callsTo(fn, "storage")).toHaveLength(2);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ files: { ph: ["file-1", "file-2"] } });
  });

  it("отказ 422 по файлу: текст расширения у кнопки, пункт подсвечен, файлы на месте", async () => {
    const { root } = await mounted({
      submit: {
        status: 422,
        body: {
          success: false,
          code: "refused",
          message: "Файл не найден — прикрепите его ещё раз",
          issues: { fields: ["ph"] },
        },
      },
    });
    choose(root, "ph", [png()]);
    fillContacts(root);
    await settle();
    submitButton(root).click();
    await settle();
    expect(box(root).textContent).toContain(
      "Файл не найден — прикрепите его ещё раз",
    );
    expect(field(root, "ph").querySelector(".sf-up.bad")).not.toBeNull();
    expect(removeButtons(root, "ph")).toHaveLength(1);
  });

  it("загрузка файла не сбивает фокус с поля, где пишут", async () => {
    const storage = gate({ status: 204, body: null });
    const { root } = await mounted({ storage: storage.route });
    choose(root, "ph", [png()]);
    const note = root.querySelector('[data-xp-field="nt"]') as HTMLInputElement;
    note.focus();
    storage.release();
    await settle();
    expect(document.activeElement).toBe(note);
    expect(note.isConnected).toBe(true);
  });
});

describe("мелочи 5.1", () => {
  it("форма прячет переключатель количества вместе с кнопками покупки", async () => {
    const { root } = await mounted({}, page(true));
    const quantity = root.querySelector(
      "[data-product-quantity]",
    ) as HTMLElement;
    expect(quantity.hidden).toBe(true);
    expect(quantity.style.display).toBe("none");
  });

  it("формы нет — переключатель количества остаётся", async () => {
    const { root } = await mounted({ map: { body: {} } }, page(true));
    const quantity = root.querySelector(
      "[data-product-quantity]",
    ) as HTMLElement;
    expect(quantity.hidden).toBe(false);
    expect(quantity.style.display).toBe("");
  });

  it("экран ответа прокручивается к началу формы", async () => {
    const { root } = await mounted();
    choose(root, "ph", [png()]);
    fillContacts(root);
    await settle();
    submitButton(root).click();
    await settle();
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(scrollIntoView.mock.instances.at(-1)).toBe(box(root));
  });
});
