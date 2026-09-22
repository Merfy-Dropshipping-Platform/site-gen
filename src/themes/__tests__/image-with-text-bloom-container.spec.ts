/**
 * «Изображение с текстом» — тумблер «Контейнер» ТОЛЬКО у bloom.
 *
 * Репорт тестера 15.09, пункт [23], дословно: «В Изображении с текстом у
 * bloom добавить в сайдбар тумблер контейнера (вкл/выкл)». Поля
 * `containerEnabled` не было ни в одной теме (замер 15.09 — grep по
 * puckConfig пяти тем дал ноль совпадений). Владелец: «только в этой теме» —
 * значит остальные четыре темы гард обязан проверить на ОТСУТСТВИЕ поля,
 * иначе тихая утечка в rose/flux/satin/vanilla останется незамеченной.
 *
 * Формат — дословно канон дизайнера Nikita (project_container_canon_audit):
 * toggle 'true'/'false', дефолт 'false', контейнер = surface-бокс на
 * текстовую колонку (единственный «элемент» пары image+text, аналог Hero
 * boxedCls); containerColorScheme применяется ТОЛЬКО пока контейнер включён.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections bloom.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
const BLOCK = "ImageWithText";

type FieldCanon = { type: string | null; label: string; visibility: string };
type BlockCanon = { label: string; fields: Record<string, FieldCanon> };

const distReady = existsSync(
  resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  ),
);

const panels: Record<string, Record<string, BlockCanon>> = {};

beforeAll(() => {
  if (!distReady) return;
  const raw = execFileSync("node", [CANON_DUMP], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  Object.assign(panels, JSON.parse(raw).themes);
}, 300_000);

function renderSection(
  theme: string,
  props: Record<string, unknown>,
): string | null {
  const mf = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  if (!existsSync(mf)) return null;
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, theme, JSON.stringify([{ block: BLOCK, props }])],
      {
        cwd: SITES_ROOT,
        encoding: "utf-8",
        maxBuffer: 128 * 1024 * 1024,
      },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

describe("«Изображение с текстом» — панель «Контейнер» (репорт [23])", () => {
  it("dist собран", () => {
    expect(distReady).toBe(true);
  });

  // Подпись 22.09 сменилась на «Наложение» (владелец: «не контейнер, а
  // наложение»): у соседних секций «Контейнер» включает подложку, а здесь
  // тумблер включает наезд текста на фото. Ключ пропа `containerEnabled`
  // прежний — он в сохранённых ревизиях.
  it("bloom: поле containerEnabled есть, toggle, Показать/Скрыть", () => {
    if (!distReady) return;
    const field = panels.bloom?.[BLOCK]?.fields?.containerEnabled as
      | (FieldCanon & { options?: string[] })
      | undefined;
    expect(field?.type).toBe("toggle");
    expect(field?.label).toBe("Наложение");
    expect(field?.visibility).toBe("panel");
    expect(field?.options).toEqual(["true=Показать", "false=Скрыть"]);
  });

  it.each(THEMES.filter((t) => t !== "bloom"))(
    "%s: containerEnabled ОТСУТСТВУЕТ — «только в этой теме»",
    (theme) => {
      if (!distReady) return;
      const fields = panels[theme]?.[BLOCK]?.fields ?? {};
      expect(Object.keys(fields)).not.toContain("containerEnabled");
    },
  );

  // Владелец 2026-09-22: «в сайдбар изображение с текстом добавить цветовая
  // схема контейнера». Поле было в блоке с самого начала, но стояло `hidden`:
  // порт его читал (карточка красится им при включённом контейнере), а
  // мерчант выбрать схему не мог. Открыли ровно его — и ровно у bloom.
  it("bloom: containerColorScheme ВИДЕН в панели и подписан «Цветовая схема контейнера»", () => {
    if (!distReady) return;
    const field = panels.bloom?.[BLOCK]?.fields?.containerColorScheme;
    expect(field?.type).toBe("colorScheme");
    expect(field?.label).toBe("Цветовая схема контейнера");
    expect(field?.visibility).toBe("panel");
  });

  it.each(THEMES.filter((t) => t !== "bloom"))(
    "%s: containerColorScheme остаётся СКРЫТЫМ — «только в этой теме»",
    (theme) => {
      if (!distReady) return;
      const field = panels[theme]?.[BLOCK]?.fields?.containerColorScheme;
      expect(field?.visibility).toBe("off");
    },
  );
});

describe("«Изображение с текстом» (bloom) — рендер «Контейнер»", () => {
  it("без пропа: НЕТ surface-бокса (нет регрессии у существующих секций)", () => {
    const html = renderSection("bloom", { id: "iwt-1" });
    if (html === null) return;
    expect(html).not.toContain("py-8");
  });

  it("containerEnabled:'false': НЕТ surface-бокса", () => {
    const html = renderSection("bloom", {
      id: "iwt-1",
      containerEnabled: "false",
    });
    if (html === null) return;
    expect(html).not.toContain("py-8");
  });

  it("containerEnabled:'true': surface-бокс появляется на текстовой колонке", () => {
    const html = renderSection("bloom", {
      id: "iwt-1",
      containerEnabled: "true",
    });
    if (html === null) return;
    expect(html).toContain("py-8");
    expect(html).toContain("radius-card");
  });

  it("containerColorScheme применяется ТОЛЬКО при containerEnabled:'true'", () => {
    const off = renderSection("bloom", {
      id: "iwt-1",
      containerColorScheme: "4",
    });
    const onWithoutToggle = off; // тот же вызов — containerEnabled не задан
    if (off === null) return;
    expect(onWithoutToggle).not.toContain("color-scheme-4");

    const on = renderSection("bloom", {
      id: "iwt-1",
      containerEnabled: "true",
      containerColorScheme: "4",
    });
    expect(on).toContain("color-scheme-4");
    expect(on).toContain("py-8");
  });

  it.each(THEMES.filter((t) => t !== "bloom"))(
    "%s: containerEnabled:'true' не ломает рендер (поля нет — проп молча игнорируется)",
    (theme) => {
      const html = renderSection(theme, {
        id: "iwt-1",
        containerEnabled: "true",
      });
      if (html === null) return;
      expect(html).not.toContain("py-8");
    },
  );
});
