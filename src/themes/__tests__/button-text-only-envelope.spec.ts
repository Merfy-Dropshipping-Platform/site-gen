/**
 * Кнопка, у которой задан ТОЛЬКО текст, доезжает до рендера.
 *
 * Жалоба владельца 2026-09-16 про секцию «Вход»: «текст к кнопке не
 * принимается». Замер по всем пяти темам подтвердил: `button: { text: 'X' }`
 * не давал на витрине ничего.
 *
 * Причина общая, а не про «Вход». `coerceGenericLegacyProps` разворачивает
 * служебные конверты — `{ text, size?, enabled?, alignment? }` схлопывается в
 * СТРОКУ. Кнопка без ссылки состоит ровно из одного ключа `text`, поэтому
 * попадала под то же правило и приезжала в порт строкой. А кнопку читают
 * объектом (`button?.text`) все 32 места, где она рисуется, — строку не ждёт
 * никто, и текст молча пропадал. Как только мерчант задавал ещё и ссылку,
 * конверт переставал подходить под правило, и кнопка «вдруг» начинала
 * работать — отсюда и то, что баг дожил до сегодня.
 *
 * Сторожим форму пропа на выходе адаптера (это дешёвая и точная проверка) и
 * доезд текста до разметки на живом рендере.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
const COLLECTOR = resolve(__dirname, "login-button-text-paths.mjs");

const built = existsSync(
  resolve(SITES_ROOT, "dist", "src", "themes", "page-blocks.js"),
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const load = (p: string) => require(resolve(SITES_ROOT, "dist", "src", p));

describe("кнопка с одним лишь текстом не теряет форму", () => {
  it("сборка на месте", () => {
    expect(built).toBe(true);
  });

  it.each(["button", "primaryButton", "secondaryButton", "cta"])(
    "%s: { text } остаётся объектом, а не строкой",
    (key: string) => {
      if (!built) return;
      const { adaptLegacyProps } = load("themes/page-blocks.js");
      const out = adaptLegacyProps(
        { id: "LoginSection-1", [key]: { text: "Войти" } },
        null,
        "LoginSection",
      );
      expect(typeof out[key]).toBe("object");
      expect((out[key] as { text?: string }).text).toBe("Войти");
    },
  );

  it("ссылка, если она была, сохраняется", () => {
    if (!built) return;
    const { adaptLegacyProps } = load("themes/page-blocks.js");
    const fromString = adaptLegacyProps(
      { id: "X-1", button: { text: "Войти", link: "/catalog" } },
      null,
      "LoginSection",
    );
    expect(fromString.button).toEqual({ text: "Войти", href: "/catalog" });

    const fromPicker = adaptLegacyProps(
      { id: "X-1", button: { text: "Войти", link: { href: "/about" } } },
      null,
      "LoginSection",
    );
    expect((fromPicker.button as { href?: string }).href).toBe("/about");
  });

  it("обычные текстовые конверты по-прежнему разворачиваются", () => {
    if (!built) return;
    const { adaptLegacyProps } = load("themes/page-blocks.js");
    const out = adaptLegacyProps(
      { id: "X-1", heading: { text: "Заголовок", size: "large" } },
      null,
      "LoginSection",
    );
    // Это НЕ кнопка — правило свёртки для неё должно работать как раньше.
    expect(out.heading).toBe("Заголовок");
  });

  it.each(THEMES)("%s: текст кнопки доезжает до разметки", (theme: string) => {
    if (!built) return;
    // Отдельный процесс: в среде jest Astro Container отдаёт заглушку
    // (замер 2026-09-16 — 270 байт вместо ~7000), и проверка разметки прямо
    // отсюда была бы ложноотрицательной. Так же меряют соседи, см.
    // contact-form-text-field.spec.ts.
    const raw = execFileSync("node", [COLLECTOR, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const row = JSON.parse(raw) as {
      withText: boolean;
      withTextAndLink: boolean;
      onSubmitButton: boolean;
      extraAnchors: number;
      fallbackWhenEmpty: boolean;
    };
    // Главное: кнопка только с текстом рисуется. И кнопка со ссылкой тоже —
    // чтобы правка не вылечила один случай ценой другого.
    expect({ тема: theme, толькоТекст: row.withText, сСсылкой: row.withTextAndLink }).toEqual({
      тема: theme,
      толькоТекст: true,
      сСсылкой: true,
    });
    // Текст обязан стоять на КНОПКЕ ФОРМЫ входа, а не на отдельной ссылке над
    // ней (владелец 2026-09-16: «нужно нижнюю кнопку синхронизировать с
    // инпутом, а не верхнюю»). Раньше параметр рисовал вторую кнопку, и на
    // странице их было две.
    expect({
      тема: theme,
      наКнопкеФормы: row.onSubmitButton,
      лишнихКнопок: row.extraAnchors,
      подписьПоУмолчанию: row.fallbackWhenEmpty,
    }).toEqual({
      тема: theme,
      наКнопкеФормы: true,
      лишнихКнопок: 0,
      подписьПоУмолчанию: true,
    });
  }, 120_000);
});
