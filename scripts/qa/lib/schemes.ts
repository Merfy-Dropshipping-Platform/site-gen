/**
 * Цветовые схемы магазина: какие числа вообще лежат в схеме N.
 *
 * Зачем модуль. Замер «цвет чёрный» сам по себе не значит ничего: чёрный может
 * быть литералом `#000000`, а может быть честным `rgb(var(--color-text))`, в
 * котором у этой схемы как раз чёрный. Прежде чем судить мишень, надо знать
 * состав схемы. Отсюда два правила, зашитые в модуль:
 *   1) роли схемы читаются из ГОТОВОГО tokens.css (тот же текст, что уходит в
 *      браузер), а не из theme.json;
 *   2) пара схем перед вердиктом проверяется на РАЗЛИЧИМОСТЬ по нужной роли —
 *      у satin Схема 1 чёрно-белая, и на ней `#000000` и `rgb(var(--color-text))`
 *      дают одинаковые числа, то есть отличить литерал от токена НЕЛЬЗЯ.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../../../src/themes/tokens-css";
import { SITES_ROOT } from "./tailwind-css";

/** Роли, ради которых схема вообще существует (порядок — для таблиц). */
export const ROLES = [
  "--color-bg",
  "--color-text",
  "--color-heading",
  "--color-button-bg",
  "--color-button-text",
  "--color-muted",
  "--color-bg-alt",
] as const;
export type Role = (typeof ROLES)[number];

/** `scheme-4` | `4` | `color-scheme-4` → `4`. */
export const schemeNum = (id: string | number): string =>
  String(id).replace(/^(?:color-)?scheme-/, "").trim();

/** Схемы РЕАЛЬНОГО магазина тестировщика (снято с живого стенда). */
export function loadTesterSchemes(root = SITES_ROOT): Array<Record<string, unknown>> {
  return JSON.parse(
    readFileSync(resolve(root, "scripts/qa/tester-schemes.json"), "utf8"),
  ) as Array<Record<string, unknown>>;
}

/** tokens.css темы — ровно тот же код, что печатает витрина и превью. */
export function tokensCssFor(
  theme: string,
  schemes: Array<Record<string, unknown>> = loadTesterSchemes(),
): string {
  return buildTokensCss({ colorSchemes: schemes }, theme);
}

/** Тело правила `.color-scheme-N` (или null, если схемы в файле нет). */
export function schemeRule(tokensCss: string, id: string | number): string | null {
  const n = schemeNum(id);
  return (
    new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? null
  );
}

/** Все переменные схемы N: `--color-bg` → `209 77 77`. */
export function schemeTokens(
  tokensCss: string,
  id: string | number,
): Record<string, string> {
  const rule = schemeRule(tokensCss, id) ?? "";
  const out: Record<string, string> = {};
  for (const m of rule.matchAll(/(--[a-z0-9-]+):\s*([^;]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Значение переменной в схеме N. `null` — переменной в схеме НЕТ.
 *
 * Это не мелочь: `--color-primary` объявлен в theme.json каждой схемы, но
 * мерчантская схема его не печатает — узел молча падает на `:root` и замирает
 * на всех схемах сразу.
 */
export const schemeValue = (
  tokensCss: string,
  id: string | number,
  token: string,
): string | null => {
  const rule = schemeRule(tokensCss, id);
  if (rule === null) return null;
  return new RegExp(`(?:^|;)\\s*${token}:\\s*([^;]+)`).exec(rule)?.[1]?.trim() ?? null;
};

/** `209 77 77` → `rgb(209, 77, 77)`. Неразобранное — null. */
export function rgbOf(triple: string | null | undefined): string | null {
  if (!triple) return null;
  const p = triple.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
  if (p.length !== 3 || p.some(Number.isNaN)) return null;
  return `rgb(${p.join(", ")})`;
}

/** Сравнение цветов браузера и схемы в одной форме. */
export const normColor = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").replace("rgba(", "rgb(").replace(/,\s*1\)$/, ")").trim();

export type RoleValue = { token: Role | string; triple: string | null; rgb: string | null };

/** Состав схемы по ролям — таблица «что вообще может приехать в мишень». */
export function schemeRoles(
  tokensCss: string,
  id: string | number,
  roles: readonly string[] = ROLES,
): RoleValue[] {
  return roles.map((token) => {
    const triple = schemeValue(tokensCss, id, token);
    return { token, triple, rgb: rgbOf(triple) };
  });
}

/** Номера схем, которые tokens.css реально печатает. */
export function listSchemes(tokensCss: string): string[] {
  return [
    ...new Set(
      [...tokensCss.matchAll(/\.color-scheme-([0-9]+)\s*\{/g)].map((m) => m[1]),
    ),
  ];
}

export type RoleDiff = {
  token: string;
  a: string | null;
  b: string | null;
  /** Схемы различимы по этой роли: вердикт «едет/замерла» вообще возможен. */
  distinguishable: boolean;
  why: string;
};

/**
 * Различимы ли две схемы по нужной роли.
 *
 * Без этой проверки зонд «едет за схемой» врёт в обе стороны: на паре схем,
 * одинаковых по роли, любая мишень выглядит «замершей», и литерал
 * не отличить от токена. Модуль обязан честно сказать «неразличимо».
 */
export function rolesDiffer(
  tokensCss: string,
  a: string | number,
  b: string | number,
  token: string,
): RoleDiff {
  const va = schemeValue(tokensCss, a, token);
  const vb = schemeValue(tokensCss, b, token);
  if (va === null || vb === null) {
    return {
      token,
      a: va,
      b: vb,
      distinguishable: false,
      why: `роль ${token} не объявлена в схеме ${va === null ? schemeNum(a) : schemeNum(b)}`,
    };
  }
  if (va === vb) {
    return {
      token,
      a: va,
      b: vb,
      distinguishable: false,
      why: `схемы ${schemeNum(a)} и ${schemeNum(b)} дают по ${token} одно и то же (${va})`,
    };
  }
  return { token, a: va, b: vb, distinguishable: true, why: "" };
}

/**
 * Пара схем, РАЗЛИЧИМАЯ по роли: первая подходящая из списка.
 * Нет такой пары — возвращаем null, а не «берём первые попавшиеся».
 */
export function pickDistinguishablePair(
  tokensCss: string,
  token: string,
  candidates: string[] = listSchemes(tokensCss),
): [string, string] | null {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (rolesDiffer(tokensCss, candidates[i], candidates[j], token).distinguishable) {
        return [candidates[i], candidates[j]];
      }
    }
  }
  return null;
}

/** Снять tokens.css с HTML живого стенда (`<style id="__merfy_tokens_css">`). */
export function sniffTokensCss(html: string): string | null {
  return (
    /<style id="__merfy_tokens_css">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? null
  );
}

/** То же, но сходив на живой стенд. Только чтение. */
export async function fetchTokensCss(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const css = sniffTokensCss(await res.text());
  if (css === null) {
    throw new Error(`на ${url} нет <style id="__merfy_tokens_css"> — это не витрина Merfy`);
  }
  return css;
}
