/**
 * Панель обязана говорить правду о двух вещах: какая цветовая схема активна и
 * какие размеры вообще бывают.
 *
 * Откуда проверка — два решения владельца (2026-09-13):
 *
 *   1. «Цветовые схемы только из настроек темы». Замер до правки: селектор схем
 *      в конструкторе при отсутствующем `colorScheme` показывал «Схема 1»
 *      жёстко, потому что `/api/themes/:id/puck-config` вообще НЕ отдавал
 *      `defaultScheme` — конструктору неоткуда было узнать про
 *      `theme.json → defaultScheme`. У flux там стоит `scheme-2`, и витрина
 *      (tokens-css.ts → :root) красила блок второй схемой, пока панель писала
 *      «Схема 1». Мерчант настраивал вслепую.
 *
 *   2. «Убрать из пункта Размер сектор „Как в секции" во всех темах». Замер до
 *      правки: `MultiRows.rows[].size` имел опцию «Как в секции» = `inherit` у
 *      rose/vanilla/flux/bloom; satin её уже не имел (у него свой puckConfig).
 *
 * Что сторожим. Ответ берём у ТОГО ЖЕ скомпилированного контроллера, который
 * отвечает конструктору, и по КАЖДОЙ из пяти тем: у satin одиннадцать
 * собственных puckConfig, у bloom два — правка в theme-base их не касается.
 *
 * Требует сборки: pnpm build + pnpm build:blocks.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW = resolve(__dirname, "puck-config-raw.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

type Opt = { label?: unknown; value?: unknown };
type Field = {
  type?: string;
  label?: string;
  options?: Opt[];
  objectFields?: Record<string, Field>;
  arrayFields?: Record<string, Field>;
  defaultItemProps?: Record<string, unknown>;
};
type RawConfig = {
  components?: Record<string, { fields?: Record<string, Field>; defaultProps?: unknown }>;
  colorSchemes?: Array<{ id?: unknown }>;
  defaultScheme?: unknown;
};

function rawConfig(theme: Theme): RawConfig {
  const out = execFileSync("node", [RAW, theme], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as RawConfig;
}

/** `defaultScheme` темы, как он записан верстальщиком в packages/theme-<t>/theme.json. */
function manifestDefaultScheme(theme: Theme): string | null {
  const p = resolve(SITES_ROOT, "packages", `theme-${theme}`, "theme.json");
  const j = JSON.parse(readFileSync(p, "utf-8")) as { defaultScheme?: unknown };
  return typeof j.defaultScheme === "string" && j.defaultScheme.length > 0
    ? j.defaultScheme
    : null;
}

/** Обход всех полей блока вглубь (object/array), с путём для внятного сообщения. */
function walkFields(
  fields: Record<string, Field> | undefined,
  path: string[],
  visit: (path: string[], field: Field) => void,
): void {
  for (const [name, field] of Object.entries(fields ?? {})) {
    if (!field || typeof field !== "object") continue;
    const here = [...path, name];
    visit(here, field);
    if (field.objectFields) walkFields(field.objectFields, here, visit);
    if (field.arrayFields) walkFields(field.arrayFields, here, visit);
  }
}

const configs = {} as Record<Theme, RawConfig>;
beforeAll(() => {
  for (const t of THEMES) configs[t] = rawConfig(t);
}, 180_000);

describe.each(THEMES)("панель говорит правду — %s", (theme) => {
  it("puck-config темы прочитан (pnpm build + pnpm build:blocks)", () => {
    // Без конфига обе проверки ниже молчат и «всё зелено» ничего не значит.
    expect(Object.keys(configs[theme].components ?? {}).length).toBeGreaterThan(0);
  });

  // ── Решение 1: цветовые схемы только из настроек темы ──

  it("отдаёт defaultScheme темы ровно так, как он записан в theme.json", () => {
    const expected = manifestDefaultScheme(theme);
    const actual = configs[theme].defaultScheme ?? null;
    expect(actual).toBe(expected);
  });

  it("если defaultScheme задан — такая схема есть среди colorSchemes", () => {
    const declared = configs[theme].defaultScheme;
    if (typeof declared !== "string" || declared.length === 0) return;
    const ids = (configs[theme].colorSchemes ?? []).map((s) => String(s.id ?? ""));
    expect(ids).toContain(declared);
  });

  // ── Решение 2: в размерах нет «Как в секции» ──

  it("ни в одном селекте нет опции «Как в секции» / value=inherit", () => {
    const offenders: string[] = [];
    for (const [block, def] of Object.entries(configs[theme].components ?? {})) {
      walkFields(def.fields, [block], (path, field) => {
        for (const o of field.options ?? []) {
          const label = String(o?.label ?? "");
          const value = String(o?.value ?? "");
          if (value === "inherit" || /как в секции/i.test(label)) {
            offenders.push(`${path.join(".")} → "${label}"="${value}"`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("новый элемент массива не заводится с размером inherit", () => {
    const offenders: string[] = [];
    for (const [block, def] of Object.entries(configs[theme].components ?? {})) {
      walkFields(def.fields, [block], (path, field) => {
        const dip = field.defaultItemProps;
        if (!dip) return;
        for (const [k, v] of Object.entries(dip)) {
          if (v === "inherit") offenders.push(`${path.join(".")}.defaultItemProps.${k}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
