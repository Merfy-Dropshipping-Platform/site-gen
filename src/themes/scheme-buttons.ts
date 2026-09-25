/**
 * Кнопка секции ← поля цветовой схемы СВОЕЙ роли. Одно правило на все темы.
 *
 * Задача владельца 2026-09-25: «Кнопки» (две) — Основная и Дополнительная
 * берут цвета одноимённых групп схемы; «Кнопка» (одна) — всегда Основную.
 * Внутри группы каждое поле красит одно свойство: Фон → фон, Текст → буквы,
 * Обводка → рамку. До правки каждый порт темы решал это сам, и решения
 * расходились: Дополнительная в Hero была прозрачной и брала текст и рамку из
 * ОДНОГО поля «Фон» (у rose и flux — даже из Фона ОСНОВНОЙ), одиночная кнопка
 * у vanilla/flux/bloom местами садилась на Дополнительную, а «Обводку» не
 * читал почти никто. Замер и таблица — scheme-button-roles.spec.ts.
 *
 * Как устроено. Порт помечает кнопку ролью — `data-scheme-button="primary"`
 * или `"secondary"` — и больше не красит её своими классами. Цвета даёт это
 * правило: оно печатается в tokens.css, который и превью конструктора
 * (включая горячую подмену при правке схемы), и витрина кладут на страницу
 * последним и вне @layer, поэтому утилиты темы его не перебивают. Толщину и
 * форму рамки задаёт порт (`border`, `border-[1.3px]`) — это вёрстка темы, а
 * не схема.
 *
 * Дополнительная читает `--color-button-2-*`: эти имена объявлены в схемах
 * theme.json всех пяти тем, а `--color-button-secondary-*` — только у rose и
 * flux (схема мерчанта печатает оба имени одинаково, см. schemeToVars).
 */

export const SCHEME_BUTTON_ATTR = "data-scheme-button";

export type SchemeButtonRole = "primary" | "secondary";

type Paint = Record<string, string>;

/** Роль → свойство CSS → переменная схемы. */
export const SCHEME_BUTTON_ROLES: Record<
  SchemeButtonRole,
  { rest: Paint; hover: Paint }
> = {
  primary: {
    rest: {
      "background-color": "--color-button-bg",
      color: "--color-button-text",
      "border-color": "--color-button-border",
    },
    hover: {
      "background-color": "--color-button-bg-hover",
      color: "--color-button-text-hover",
    },
  },
  secondary: {
    rest: {
      "background-color": "--color-button-2-bg",
      color: "--color-button-2-text",
      "border-color": "--color-button-2-border",
    },
    hover: {
      "background-color": "--color-button-2-bg-hover",
      color: "--color-button-2-text-hover",
    },
  },
};

const declarations = (paint: Paint): string =>
  Object.entries(paint)
    .map(([prop, token]) => `${prop}:rgb(var(${token}))`)
    .join(";");

const roleSelector = (role: SchemeButtonRole): string =>
  `[${SCHEME_BUTTON_ATTR}="${role}"]`;

/**
 * Наведение возвращает `opacity:1`: порты гасят кнопку `hover:opacity-*`, и
 * цвет наведения из схемы иначе был бы виден сквозь затемнение (тот же приём,
 * что у правил наведения в global.css тем).
 */
function roleRules(role: SchemeButtonRole): string {
  const { rest, hover } = SCHEME_BUTTON_ROLES[role];
  const sel = roleSelector(role);
  return `${sel}{${declarations(rest)}}${sel}:hover{${declarations(hover)};opacity:1}`;
}

export const SCHEME_BUTTON_CSS = (
  Object.keys(SCHEME_BUTTON_ROLES) as SchemeButtonRole[]
)
  .map(roleRules)
  .join("");
