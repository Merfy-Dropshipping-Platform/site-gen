import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Параллельный поток flux (16.09) расширил матрицу схем мишенями `:hover` и
 * вскрыл 8 красных клеток в bloom, из них две относятся к моему скоупу
 * (владелец, пункт 12 общей пачки — «Вход»/«Заказы»/«Личный кабинет»: текст в
 * кнопке и кнопка при наведении не работают): AccountSection (`.account-button`)
 * и LoginSection (`.auth-button-primary`).
 *
 * Причина — общая для всех тем: наведение красилось `filter: brightness(0.85)`,
 * который темнит уже отрисованный пиксель, но НЕ трогает вычисляемые
 * `background-color`/`color` — поэтому `getComputedStyle` на `:hover` был
 * бит-в-бит равен состоянию покоя, а настройки схемы «Фон / При наведении»,
 * «Текст / При наведении» ни на что не влияли. vanilla уже почищена этим же
 * приёмом (15.09) — используем её как эталон паритета (общий класс, разные
 * темы одного семейства).
 *
 * Сторож держит ИСХОДНИК bloom, тем же приёмом, что vanilla-версия этой
 * проверки (там же живёт assertFollowsText-цепочка для той же пары классов,
 * см. `section-scheme-targets.spec.ts`, describe «vanilla · «Вход»/«Заказы»/
 * «Личный кабинет» …»). Отдельный файл — не трогаю section-scheme-targets.spec.ts,
 * который параллельно правит поток flux (риск конфликта).
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

function bloomGlobalCss(): string {
  return readFileSync(resolve(SITES_ROOT, "themes/bloom/src/styles/global.css"), "utf8");
}

function hoverRuleOf(src: string, cls: string): string {
  const re = new RegExp(
    `\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:hover:not\\(:disabled\\)\\s*\\{([^}]*)\\}`,
  );
  const body = re.exec(src)?.[1];
  expect({ cls, найдено: !!body }).toEqual({ cls, найдено: true });
  return body!;
}

describe("bloom · «Вход»/«Заказы»/«Личный кабинет» · наведение читает hover-роль схемы", () => {
  const src = bloomGlobalCss();

  it.each(["auth-button-primary", "account-button"])("%s · наведение НЕ на filter/brightness", (cls) => {
    const body = hoverRuleOf(src, cls);
    expect({ cls, filter: /filter\s*:/.test(body) }).toEqual({ cls, filter: false });
  });

  it.each(["auth-button-primary", "account-button"])("%s · фон наведения — --color-button-bg-hover", (cls) => {
    const body = hoverRuleOf(src, cls);
    expect(/background-color\s*:\s*rgb\(var\(--color-button-bg-hover/.test(body)).toBe(true);
  });

  it.each(["auth-button-primary", "account-button"])("%s · текст наведения — --color-button-text-hover", (cls) => {
    const body = hoverRuleOf(src, cls);
    expect(/color\s*:\s*rgb\(var\(--color-button-text-hover/.test(body)).toBe(true);
  });
});
