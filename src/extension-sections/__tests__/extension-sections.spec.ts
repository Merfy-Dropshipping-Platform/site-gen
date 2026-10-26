import { readFileSync } from "fs";
import * as path from "path";
import type { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import type {
  BuilderAnswer,
  StorefrontBuilderClient,
} from "../../storefront-preview/storefront-builder.client";
import {
  ExtensionToggledSchema,
  SectionAcceptReplySchema,
  SectionAcceptRequestSchema,
} from "../extension-sections.contract";
import {
  BUILDER_TIMEOUT_MS,
  ExtensionSectionsController,
  replyOf,
} from "../extension-sections.controller";
import type { ExtensionPlaces } from "../extension-places";

// Договор extensions ↔ sites (блок 12 «Секций и SDK», часть 12б): тот же набор
// примеров проходит копия договора в extensions (src/sites/).
interface Examples {
  accept: { valid: unknown[]; invalid: { why: string; request: unknown }[] };
  replies: { valid: unknown[]; invalid: { why: string; reply: unknown }[] };
  toggled: { valid: unknown[]; invalid: { why: string; message: unknown }[] };
}
const examples = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/extension-sections.examples.json"),
    "utf8",
  ),
) as Examples;
const [REQUEST] = examples.accept.valid;
const SHOP = "3a9626f7-390d-4a66-bca5-a3b806ca6c1b";

const json = (status: number, body: unknown): BuilderAnswer => ({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body),
});

function controllerWith(answer: BuilderAnswer) {
  const call = jest.fn().mockResolvedValue(answer);
  const notify = jest.fn().mockResolvedValue(undefined);
  // Место по умолчанию (часть 12д) — в extension-places.spec.ts; здесь магазин нынешней темы: place не зовётся.
  const isNewTheme = jest.fn().mockResolvedValue(false);
  const controller = new ExtensionSectionsController(
    { call } as unknown as StorefrontBuilderClient,
    { notify, isNewTheme } as unknown as StorefrontHandoff,
    { place: jest.fn() } as unknown as ExtensionPlaces,
  );
  return { controller, call, notify };
}

describe("договор: набор примеров", () => {
  it.each(examples.accept.valid)("запрос годится: %j", (request) => {
    expect(SectionAcceptRequestSchema.safeParse(request).success).toBe(true);
  });
  it.each(examples.accept.invalid)(
    "запрос: $why — не годится",
    ({ request }) => {
      expect(SectionAcceptRequestSchema.safeParse(request).success).toBe(false);
    },
  );
  it.each(examples.replies.valid)("ответ годится: %j", (reply) => {
    expect(SectionAcceptReplySchema.safeParse(reply).success).toBe(true);
  });
  it.each(examples.replies.invalid)("ответ: $why — не годится", ({ reply }) => {
    expect(SectionAcceptReplySchema.safeParse(reply).success).toBe(false);
  });
  it.each(examples.toggled.valid)("событие годится: %j", (message) => {
    expect(ExtensionToggledSchema.safeParse(message).success).toBe(true);
  });
  it.each(examples.toggled.invalid)(
    "событие: $why — не годится",
    ({ message }) => {
      expect(ExtensionToggledSchema.safeParse(message).success).toBe(false);
    },
  );
});

describe("ответ сборщика → ответ RPC", () => {
  const cases: [string, BuilderAnswer, unknown][] = [
    [
      "200 — success с полным именем и id строки",
      json(200, {
        ok: true,
        status: "accepted",
        name: "test-ext:reviews",
        id: "row-1",
      }),
      {
        success: true,
        data: { status: "accepted", name: "test-ext:reviews", id: "row-1" },
      },
    ],
    [
      "422 — refused, проблемы без ссылки doc",
      json(422, {
        ok: false,
        name: "test-ext:reviews",
        problems: [
          {
            code: "class-unknown",
            file: "template.astro",
            line: 1,
            column: 13,
            message: "класс unknown-x не из словаря",
            doc: "errors.md#class-unknown",
          },
        ],
        warnings: [],
      }),
      {
        success: false,
        error: {
          code: "refused",
          message: "секция не прошла проверку",
          problems: [
            {
              code: "class-unknown",
              file: "template.astro",
              line: 1,
              column: 13,
              message: "класс unknown-x не из словаря",
            },
          ],
        },
      },
    ],
    [
      "503 uploads-closed — uploads-closed",
      json(503, {
        ok: false,
        error: { code: "uploads-closed", message: "песочница не закрыта" },
      }),
      {
        success: false,
        error: { code: "uploads-closed", message: "песочница не закрыта" },
      },
    ],
    [
      "400 name-invalid — body-invalid",
      json(400, {
        ok: false,
        error: { code: "name-invalid", message: "нужны ?extension=…" },
      }),
      {
        success: false,
        error: { code: "body-invalid", message: "нужны ?extension=…" },
      },
    ],
    [
      "500 tool-failed — tool-failed",
      json(500, {
        ok: false,
        error: { code: "tool-failed", message: "упало" },
      }),
      { success: false, error: { code: "tool-failed", message: "упало" } },
    ],
    [
      "502 текстом (сборщик не ответил) — builder-unavailable",
      {
        status: 502,
        contentType: "text/plain; charset=utf-8",
        body: "сборщик витрин не ответил",
      },
      {
        success: false,
        error: {
          code: "builder-unavailable",
          message: "сборщик витрин не ответил",
        },
      },
    ],
    [
      "404 пустым телом (старый сборщик без входа) — builder-unavailable",
      { status: 404, contentType: "text/plain; charset=utf-8", body: "" },
      {
        success: false,
        error: { code: "builder-unavailable", message: "сборщик ответил 404" },
      },
    ],
  ];

  it.each(cases)("%s", (_title, answer, reply) => {
    expect(replyOf(answer)).toEqual(reply);
    expect(SectionAcceptReplySchema.safeParse(replyOf(answer)).success).toBe(
      true,
    );
  });
});

describe("sites.extension.section.accept", () => {
  it("годный запрос — сборщику POST /sections/extension с адресом, телом { files } и сроком 30 с", async () => {
    const { controller, call } = controllerWith(
      json(200, {
        ok: true,
        status: "accepted",
        name: "test-ext:reviews",
        id: "row-1",
      }),
    );
    const reply = await controller.accept(REQUEST);
    expect(reply).toEqual({
      success: true,
      data: { status: "accepted", name: "test-ext:reviews", id: "row-1" },
    });
    expect(call).toHaveBeenCalledWith(
      "/sections/extension",
      {
        extension: "test-ext",
        release: "0.1.0",
        kind: "section",
        name: "reviews",
      },
      JSON.stringify({ files: (REQUEST as { files: unknown }).files }),
      BUILDER_TIMEOUT_MS,
    );
  });

  it.each(examples.accept.invalid)(
    "$why — body-invalid, сборщик не зовётся",
    async ({ request }) => {
      const { controller, call } = controllerWith(json(200, {}));
      const reply = await controller.accept(request);
      expect(reply).toMatchObject({
        success: false,
        error: { code: "body-invalid" },
      });
      expect(call).not.toHaveBeenCalled();
    },
  );
});

describe("sites.extension.toggled", () => {
  it("toggled — событие extension-toggle сборщику для магазина из сообщения", async () => {
    const { controller, notify } = controllerWith(json(200, {}));
    await controller.toggled({
      shopId: SHOP,
      extensionId: "test-ext",
      state: "disabled",
    });
    expect(notify).toHaveBeenCalledWith(
      SHOP,
      "extension-toggle",
      "sites.extension.toggled",
    );
  });

  it.each(examples.toggled.invalid)(
    "$why — события нет",
    async ({ message }) => {
      const { controller, notify } = controllerWith(json(200, {}));
      await controller.toggled(message);
      expect(notify).not.toHaveBeenCalled();
    },
  );
});
