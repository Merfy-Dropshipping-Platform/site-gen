/**
 * Файлы формы покупки (задача 5.2): чистые функции без DOM и сети — тип и
 * годность файла, разбор ответов шлюза на шагах 1 и 3, выбор файлов в пункт,
 * id готовых файлов в отправке и разметка плитки выбора. Моков нет.
 * Загрузка в браузере — extension-purchase-files.dom.test.ts.
 */
import {
  applyOutcome,
  entriesOf,
  fileCounts,
  findEntry,
  pendingUploads,
  pickFiles,
  readyFileIds,
  uploadControlHtml,
  uploadFieldOf,
  type FileEntries,
  type UploadEntry,
  type UploadField,
} from "../runtime/extension-purchase-files";
import { collectSubmitInput } from "../runtime/extension-purchase";
import { EXTENSION_PURCHASE_STYLES } from "../runtime/extension-purchase.styles";
import {
  canPreview,
  fileMime,
  fileProblem,
  startFailure,
  uploadFormOf,
  verdictOf,
} from "../runtime/extension-upload";
import type { FormV2 } from "../runtime/forms-vendor/types-v2";
import { VERSTAK_FORM } from "../stand/extension-purchase/stand-data";

const MB = 1024 * 1024;
const SUBMIT_ID = "5b0e2f0c-4f5e-4c53-8a43-6d1b7a1a9f10";

const photoField: UploadField = {
  id: "f44",
  kind: "field",
  type: "photo",
  title: "Фото комнаты",
  visible: true,
  required: false,
  maxFiles: 5,
};
const videoField: UploadField = {
  id: "v1",
  kind: "field",
  type: "video",
  title: "Видео",
  visible: true,
  required: false,
};

const facts = (name: string, type: string, size = 1000) => ({
  name,
  type,
  size,
});

function entry(
  key: string,
  name: string,
  status: UploadEntry["status"] = "ready",
  preview = "",
): UploadEntry {
  return {
    key,
    type: name.endsWith(".mp4") ? "video" : "photo",
    file: new File(["x"], name),
    status,
    fileId: status === "ready" ? `id-${key}` : "",
    preview,
    job: Promise.resolve(),
  };
}

describe("fileMime: тип файла для шага 1", () => {
  it.each([
    ["IMG_0001.HEIC", "", "image/heic"],
    ["photo.heif", "image/heif", "image/heic"],
    ["room.jpg", "image/jpeg", "image/jpeg"],
    ["clip.MOV", "", "video/quicktime"],
    ["plan.pdf", "", "application/pdf"],
    [
      "smeta.docx",
      "",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ])("%s (браузер: «%s») → %s", (name, type, mime) => {
    expect(fileMime({ name, type })).toBe(mime);
  });

  it("незнакомое расширение — тип из браузера", () => {
    expect(fileMime({ name: "scan", type: "image/png" })).toBe("image/png");
    expect(fileMime({ name: "x.constructor", type: "" })).toBe("");
  });

  it("превью — у JPEG, PNG, WebP, GIF; у HEIC его нет", () => {
    expect(canPreview({ name: "a.png", type: "image/png" })).toBe(true);
    expect(canPreview({ name: "a.jpeg", type: "" })).toBe(true);
    expect(canPreview({ name: "IMG.HEIC", type: "image/heic" })).toBe(false);
  });
});

describe("fileProblem: годится ли файл пункту (FILE_LIMITS)", () => {
  it.each([
    ["photo", facts("IMG.HEIC", ""), null],
    ["photo", facts("room.webp", "image/webp"), null],
    ["photo", facts("plan.pdf", "application/pdf"), "format"],
    ["photo", facts("room.png", "image/png", 21 * MB), "size"],
    ["photo", facts("room.png", "image/png", 0), "empty"],
    ["video", facts("clip.mov", ""), null],
    ["video", facts("clip.avi", "video/x-msvideo"), "format"],
    ["video", facts("clip.mp4", "video/mp4", 500 * MB + 1), "size"],
    ["file", facts("smeta.xlsx", ""), null],
    ["file", facts("notes.txt", "text/plain"), "format"],
  ] as const)("%s: %o → %s", (type, file, reason) => {
    expect(fileProblem(type, file)).toBe(reason);
  });
});

describe("ответы шлюза", () => {
  const form = {
    fileId: "file-1",
    upload: {
      url: "https://storage.test/ext-files",
      fields: { key: "s/e/file-1", policy: "p" },
    },
    expiresAt: "2026-10-13T20:00:00.000Z",
  };

  it("шаг 1: форма хранилища из любого 2xx; поля — парами по порядку", () => {
    expect(
      uploadFormOf({ status: 201, body: { success: true, data: form } }),
    ).toEqual({
      fileId: "file-1",
      url: "https://storage.test/ext-files",
      fields: [
        ["key", "s/e/file-1"],
        ["policy", "p"],
      ],
    });
  });

  it.each([
    null,
    { status: 500, body: { success: true, data: form } },
    { status: 201, body: { success: false } },
    { status: 201, body: { success: true, data: { fileId: 5 } } },
    { status: 201, body: { success: true, data: { fileId: "f" } } },
    {
      status: 201,
      body: {
        success: true,
        data: { ...form, upload: { url: "u", fields: { n: 1 } } },
      },
    },
  ])("шаг 1: не та форма — null (%#)", (reply) => {
    expect(uploadFormOf(reply)).toBeNull();
  });

  it("шаг 1: отказ шлюза по коду — без повтора; остальное — сбой", () => {
    const refusal = (code: string) => ({
      status: 400,
      body: { success: false, code, message: "m" },
    });
    expect(startFailure(refusal("too_large"))).toEqual({
      kind: "rejected",
      reason: "size",
    });
    expect(startFailure(refusal("mime_not_allowed"))).toEqual({
      kind: "rejected",
      reason: "format",
    });
    expect(startFailure(refusal("invalid_kind"))).toEqual({
      kind: "rejected",
      reason: "format",
    });
    expect(startFailure(refusal("forbidden"))).toEqual({ kind: "failed" });
    expect(startFailure(refusal("constructor"))).toEqual({ kind: "failed" });
    expect(startFailure({ status: 429, body: null })).toEqual({
      kind: "failed",
    });
    expect(startFailure(null)).toEqual({ kind: "failed" });
  });

  it("шаг 3: ready → готов, rejected → причина, чужой fileId или сбой → failed", () => {
    const done = (data: unknown, status = 201) => ({
      status,
      body: { success: true, data },
    });
    expect(verdictOf(done({ fileId: "f1", status: "ready" }), "f1")).toEqual({
      kind: "ready",
      fileId: "f1",
    });
    expect(
      verdictOf(
        done({ fileId: "f1", status: "rejected", reason: "too_large" }),
        "f1",
      ),
    ).toEqual({ kind: "rejected", reason: "size" });
    expect(
      verdictOf(
        done({ fileId: "f1", status: "rejected", reason: "wrong_type" }),
        "f1",
      ),
    ).toEqual({ kind: "rejected", reason: "format" });
    expect(verdictOf(done({ fileId: "f2", status: "ready" }), "f1")).toEqual({
      kind: "failed",
    });
    expect(
      verdictOf(done({ fileId: "f1", status: "ready" }, 404), "f1"),
    ).toEqual({ kind: "failed" });
    expect(verdictOf(done({ fileId: "f1", status: "pending" }), "f1")).toEqual({
      kind: "failed",
    });
    expect(verdictOf(null, "f1")).toEqual({ kind: "failed" });
  });
});

describe("pickFiles: какие файлы встают в пункт", () => {
  it("годные берутся по порядку, причина первого отказа — текстом", () => {
    const result = pickFiles(
      photoField,
      [
        facts("a.png", "image/png"),
        facts("plan.pdf", "application/pdf"),
        facts("big.jpg", "image/jpeg", 25 * MB),
        facts("IMG.HEIC", ""),
      ],
      {},
    );
    expect(result.accepted.map((file) => file.name)).toEqual([
      "a.png",
      "IMG.HEIC",
    ]);
    expect(result.problem).toBe("«plan.pdf»: такой формат не подходит");
  });

  it("больше maxFiles — лишние не берутся, текст пакета форм", () => {
    const picked = Array.from({ length: 4 }, (_, i) =>
      facts(`p${i}.png`, "image/png"),
    );
    const files: FileEntries = {
      f44: [entry("1", "a.png"), entry("2", "b.png")],
    };
    const result = pickFiles(photoField, picked, files);
    expect(result.accepted).toHaveLength(3);
    expect(result.problem).toBe("Не больше 5 фото");
  });

  it("без maxFiles — один файл", () => {
    const result = pickFiles(
      videoField,
      [facts("a.mp4", "video/mp4"), facts("b.mp4", "video/mp4")],
      {},
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.problem).toBe("Не больше 1 видео");
  });

  it("все файлы формы вместе — не больше 2 ГБ", () => {
    const big = new File(["x"], "big.mp4");
    Object.defineProperty(big, "size", { value: 2040 * MB });
    const files: FileEntries = {
      v1: [{ ...entry("1", "big.mp4"), file: big }],
    };
    const result = pickFiles(
      { ...photoField, id: "f44" },
      [facts("a.png", "image/png", 15 * MB)],
      files,
    );
    expect(result.accepted).toHaveLength(0);
    expect(result.problem).toBe("Файлы вместе больше 2 ГБ");
  });

  it("большой файл называет предел своего типа", () => {
    const result = pickFiles(
      photoField,
      [facts("big.jpg", "image/jpeg", 21 * MB)],
      {},
    );
    expect(result.problem).toBe("«big.jpg»: больше 20 МБ");
  });
});

describe("состояние файлов", () => {
  const files: FileEntries = {
    f44: [
      entry("1", "a.png"),
      entry("2", "b.png", "loading"),
      entry("3", "c.png", "failed"),
    ],
    v1: [entry("4", "clip.mp4")],
    empty: [],
  };

  it("в отправку — id только готовых файлов; пункт без готовых не попадает", () => {
    expect(readyFileIds(files)).toEqual({ f44: ["id-1"], v1: ["id-4"] });
  });

  it("для проверки формы считаются все выбранные файлы", () => {
    expect(fileCounts(files)).toEqual({ f44: 3, v1: 1, empty: 0 });
  });

  it("ждут загрузки — грузящиеся и неудачные", () => {
    expect(
      pendingUploads(files).map(({ itemId, entry }) => [itemId, entry.key]),
    ).toEqual([
      ["f44", "2"],
      ["f44", "3"],
    ]);
  });

  it("запись находится по номеру; чужой номер — null", () => {
    expect(findEntry(files, "4")?.itemId).toBe("v1");
    expect(findEntry(files, "9")).toBeNull();
  });

  it("id пункта из данных расширения: «constructor» — не ключ объекта", () => {
    expect(entriesOf(files, "constructor")).toEqual([]);
    expect(entriesOf(files, "f44")).toHaveLength(3);
  });

  it("файловый пункт по id; поле другого типа или нет такого — null", () => {
    expect(uploadFieldOf(VERSTAK_FORM.items, "f44")?.type).toBe("photo");
    expect(uploadFieldOf(VERSTAK_FORM.items, "f40")).toBeNull();
    expect(uploadFieldOf(VERSTAK_FORM.items, undefined)).toBeNull();
  });
});

describe("applyOutcome: итог загрузки", () => {
  it("ready — готов и с id; failed — не загрузился, без id", () => {
    const ready = entry("1", "a.png", "loading");
    expect(applyOutcome(ready, { kind: "ready", fileId: "file-9" })).toBe("");
    expect([ready.status, ready.fileId]).toEqual(["ready", "file-9"]);
    const failed = entry("2", "b.png", "loading");
    expect(applyOutcome(failed, { kind: "failed" })).toBe("");
    expect([failed.status, failed.fileId]).toEqual(["failed", ""]);
  });

  it("rejected — текст для пункта с именем файла и причиной", () => {
    expect(
      applyOutcome(entry("1", "a.png", "loading"), {
        kind: "rejected",
        reason: "format",
      }),
    ).toBe("«a.png»: такой формат не подходит");
    expect(
      applyOutcome(entry("2", "clip.mp4", "loading"), {
        kind: "rejected",
        reason: "size",
      }),
    ).toBe("«clip.mp4»: больше 500 МБ");
  });
});

describe("uploadControlHtml: плитка выбора и выбранные файлы", () => {
  it("без файлов — «Выбрать фото» и подсказка без «выбрано»", () => {
    const html = uploadControlHtml(photoField, [], false);
    expect(html).toContain("<b>Выбрать фото</b>");
    expect(html).toContain("JPEG, PNG, HEIC, WebP или GIF до 20 МБ · до 5<");
    expect(html).toContain('data-xp-file="f44"');
    expect(html).toContain(" multiple");
    expect(html).not.toContain("sf-th");
  });

  it("три фото — «Добавить ещё», «выбрано 3», плитки с превью и «Убрать файл»", () => {
    const entries = [
      entry("1", "a.png", "ready", "blob:a"),
      entry("2", "b.png", "ready", "blob:b"),
      entry("3", "c.png", "ready", "blob:c"),
    ];
    const html = uploadControlHtml(photoField, entries, false);
    expect(html).toContain("<b>Добавить ещё</b>");
    expect(html).toContain("до 20 МБ · до 5 · выбрано 3");
    expect(html.match(/aria-label="Убрать файл"/g)).toHaveLength(3);
    expect(html).toContain('<img alt="" src="blob:b">');
    expect(html).toContain('data-xp-remove="3"');
    expect(html).not.toContain("<small>загружается</small>");
  });

  it("HEIC — плитка без картинки, с расширением имени", () => {
    const html = uploadControlHtml(
      photoField,
      [entry("1", "IMG_7.heic")],
      false,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("<span>HEIC</span>");
  });

  it("пометки: грузится и не загрузился", () => {
    const html = uploadControlHtml(
      photoField,
      [entry("1", "a.png", "loading"), entry("2", "b.png", "failed")],
      false,
    );
    expect(html).toContain('class="sf-thumb loading"');
    expect(html).toContain("<small>загружается</small>");
    expect(html).toContain('class="sf-thumb failed"');
    expect(html).toContain("<small>не загрузился</small>");
  });

  it("файлов сколько можно — плитки выбора нет", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry(String(i), `p${i}.png`),
    );
    const html = uploadControlHtml(photoField, entries, false);
    expect(html).not.toContain("data-xp-file");
    expect(html.match(/aria-label="Убрать файл"/g)).toHaveLength(5);
  });

  it("видео — строкой «▶ имя» и «убрать»; без maxFiles плитка пропадает после первого", () => {
    const html = uploadControlHtml(
      videoField,
      [entry("1", "clip.mp4", "loading")],
      false,
    );
    expect(html).toContain(
      '<div class="sf-fl loading"><span>▶ clip.mp4 · загружается</span>',
    );
    expect(html).toContain('aria-label="Убрать файл">убрать</button>');
    expect(html).not.toContain("data-xp-file");
  });

  it("рамка .bad у плитки выбора, когда у пункта ошибка", () => {
    expect(uploadControlHtml(photoField, [], true)).toContain(
      'class="sf-up bad"',
    );
  });

  it("имя файла экранируется", () => {
    const html = uploadControlHtml(
      videoField,
      [entry("1", '<img src=x onerror="a">.mp4')],
      false,
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;.mp4");
  });
});

describe("collectSubmitInput: файлы в теле отправки", () => {
  const state = {
    values: {},
    contacts: { email: "igor@example.ru" },
    submitId: SUBMIT_ID,
  };

  it("id готовых файлов — у видимых файловых пунктов", () => {
    const input = collectSubmitInput("p1", VERSTAK_FORM, state, {
      f44: ["file-1", "file-2"],
    });
    expect(input.files).toEqual({ f44: ["file-1", "file-2"] });
    expect(input.values).not.toHaveProperty("f44");
  });

  it("скрытый пункт, нефайловый пункт и пустой список — не попадают", () => {
    const form: FormV2 = {
      version: 2,
      items: VERSTAK_FORM.items.map((item) =>
        item.id === "f44" ? { ...item, visible: false } : item,
      ),
    };
    expect(
      collectSubmitInput("p1", form, state, { f44: ["file-1"] }).files,
    ).toEqual({});
    expect(
      collectSubmitInput("p1", VERSTAK_FORM, state, {
        f40: ["file-1"],
        f44: [],
      }).files,
    ).toEqual({});
  });

  it("без списка файлов — пусто, как в 5.1", () => {
    expect(collectSubmitInput("p1", VERSTAK_FORM, state).files).toEqual({});
  });
});

describe("стили формы", () => {
  it("экран ответа не уходит под липкую шапку темы: scroll-margin-top у .xp", () => {
    const block = EXTENSION_PURCHASE_STYLES.split("\n}")[0];
    expect(block.startsWith(".xp {")).toBe(true);
    expect(block).toContain("scroll-margin-top: 96px;");
  });

  it("плитки фото и строки файлов есть в стилях", () => {
    expect(EXTENSION_PURCHASE_STYLES).toContain(".xp .sf-th {");
    expect(EXTENSION_PURCHASE_STYLES).toContain(".xp .sf-thumb button {");
    expect(EXTENSION_PURCHASE_STYLES).toContain(".xp .sf-fl {");
  });
});
